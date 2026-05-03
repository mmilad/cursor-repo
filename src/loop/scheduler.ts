/**
 * Main agent loop — wires together GitHub polling, PR processing, and task ingestion.
 * Driven by a croner schedule or called once (one-shot / CLI mode).
 */
import { Cron } from "croner";
import { CursorController } from "../controller/index.js";
import { GitHubClient } from "../github/client.js";
import { prReviewTemplate, prFollowUpTemplate, prTaskTemplate } from "../templates/pr-agent.js";
import { loadConfig, type LoopConfig } from "./config.js";
import { processPR } from "./pr-processor.js";
import { processTask } from "./task-processor.js";
import { StateStore } from "./state.js";

function makeLog(prefix = "[agent-loop]") {
  return (msg: string) => console.log(`${prefix} ${new Date().toISOString()} ${msg}`);
}

export type CycleResult = {
  prsProcessed: number;
  tasksProcessed: number;
  errors: string[];
};

/** Run one full poll cycle: process all repos, PRs, and task issues. */
export async function runCycle(config?: LoopConfig): Promise<CycleResult> {
  const cfg = config ?? loadConfig();
  const github = new GitHubClient(cfg.githubToken);
  const state = new StateStore();
  const controller = new CursorController({
    localCwd: cfg.localCwd,
    local: { settingSources: [] },
  });
  const log = makeLog();

  const errors: string[] = [];
  let prsProcessed = 0;
  let tasksProcessed = 0;

  state.gc();

  // Process repos with concurrency limit
  for (const repo of cfg.repos) {
    const slug = `${repo.owner}/${repo.repo}`;
    log(`polling ${slug}`);

    try {
      // PRs
      const prs = await github.listOpenPRs(repo);
      log(`  ${prs.length} open PRs in ${slug}`);

      const prChunks = chunk(prs, cfg.concurrencyLimit);
      for (const batch of prChunks) {
        await Promise.all(
          batch.map(async (pr) => {
            try {
              await processPR(pr, {
                controller,
                github,
                state,
                config: cfg,
                reviewTemplate: prReviewTemplate,
                followUpTemplate: prFollowUpTemplate,
                log,
              });
              prsProcessed++;
            } catch (err) {
              const msg = `PR ${slug}#${pr.number}: ${String(err)}`;
              log(`ERROR ${msg}`);
              errors.push(msg);
            }
          }),
        );
      }

      // Task issues
      const issues = await github.listTaskIssues(repo, cfg.taskLabel);
      log(`  ${issues.length} task issues in ${slug}`);

      for (const issue of issues) {
        try {
          await processTask(issue, {
            controller,
            github,
            state,
            config: cfg,
            taskTemplate: prTaskTemplate,
            log,
          });
          tasksProcessed++;
        } catch (err) {
          const msg = `Task ${slug}#${issue.number}: ${String(err)}`;
          log(`ERROR ${msg}`);
          errors.push(msg);
        }
      }
    } catch (err) {
      const msg = `Repo ${slug}: ${String(err)}`;
      log(`ERROR ${msg}`);
      errors.push(msg);
    }
  }

  return { prsProcessed, tasksProcessed, errors };
}

/** Start the daemon using a cron schedule. Returns the Cron instance (call `.stop()` to halt). */
export function startDaemon(config?: LoopConfig): Cron {
  const cfg = config ?? loadConfig();
  const log = makeLog();

  log(`starting daemon (schedule: "${cfg.cronExpression}")`);
  log(`watching repos: ${cfg.repos.map((r) => `${r.owner}/${r.repo}`).join(", ")}`);

  const job = new Cron(cfg.cronExpression, { catch: true }, async () => {
    log("cycle start");
    try {
      const result = await runCycle(cfg);
      log(
        `cycle done — PRs: ${result.prsProcessed}, tasks: ${result.tasksProcessed}, errors: ${result.errors.length}`,
      );
      if (result.errors.length > 0) {
        for (const e of result.errors) log(`  error: ${e}`);
      }
    } catch (err) {
      log(`cycle fatal error: ${String(err)}`);
    }
  });

  return job;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
