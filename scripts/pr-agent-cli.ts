#!/usr/bin/env node
/**
 * PR-agent loop CLI.
 *
 * Commands:
 *   npm run pr-agent -- daemon           Start the scheduler (runs indefinitely)
 *   npm run pr-agent -- cycle            Run one poll cycle and exit
 *   npm run pr-agent -- status           Print state of all tracked PRs and tasks
 *   npm run pr-agent -- review <owner/repo> <prNumber>   Review one PR manually
 */
import { CursorAgentError } from "@cursor/sdk";
import { GitHubClient } from "../src/github/client.js";
import { runCycle, startDaemon, StateStore, loadConfig } from "../src/loop/index.js";
import { CursorController } from "../src/controller/index.js";
import { prReviewTemplate, prFollowUpTemplate, prTaskTemplate } from "../src/templates/pr-agent.js";
import { processPR } from "../src/loop/pr-processor.js";
import { processTask } from "../src/loop/task-processor.js";

function usage(): never {
  console.error(`Usage:
  npm run pr-agent -- daemon
  npm run pr-agent -- cycle
  npm run pr-agent -- status
  npm run pr-agent -- review <owner/repo> <prNumber>

Environment (see .env.example):
  CURSOR_API_KEY         required
  GITHUB_TOKEN           required
  GITHUB_REPOS           required  e.g. "myorg/api,myorg/frontend"
  LOOP_CRON              optional  cron expression (default: "*/5 * * * *")
  AUTO_MERGE             optional  "true" to enable auto-merge after approval
  REQUIRED_APPROVALS     optional  number of approvals needed (default: 1)
  TASK_LABEL             optional  GitHub issue label (default: "agent-task")
  CURSOR_CLOUD_REPO_URL  optional  git URL for cloud agents
  CONCURRENCY_LIMIT      optional  max concurrent PR jobs (default: 3)
`);
  process.exit(1);
}

async function cmdDaemon(): Promise<void> {
  const job = startDaemon();
  console.log("[pr-agent] daemon started. Press Ctrl+C to stop.");
  await new Promise<void>((_, reject) => {
    process.on("SIGINT", () => {
      job.stop();
      console.log("[pr-agent] stopped.");
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      job.stop();
      process.exit(0);
    });
  });
}

async function cmdCycle(): Promise<void> {
  console.log("[pr-agent] running one cycle...");
  const result = await runCycle();
  console.log(`[pr-agent] done. PRs: ${result.prsProcessed}, tasks: ${result.tasksProcessed}`);
  if (result.errors.length > 0) {
    for (const e of result.errors) console.error(`  error: ${e}`);
    process.exitCode = 1;
  }
}

async function cmdStatus(): Promise<void> {
  const state = new StateStore();
  const prs = state.allPRs();
  const tasks = state.allTasks();

  if (prs.length === 0 && tasks.length === 0) {
    console.log("[pr-agent] no tracked PRs or tasks.");
    return;
  }

  if (prs.length > 0) {
    console.log("\n## Pull Requests\n");
    for (const pr of prs.sort((a, b) => a.repoSlug.localeCompare(b.repoSlug))) {
      const icon = statusIcon(pr.status);
      console.log(
        `  ${icon} ${pr.repoSlug}#${pr.prNumber}  [${pr.status}]  sha=${pr.headSha.slice(0, 7)}  follow-ups=${pr.followUpCount}  updated=${pr.lastUpdatedAt}`,
      );
    }
  }

  if (tasks.length > 0) {
    console.log("\n## Tasks\n");
    for (const t of tasks.sort((a, b) => a.repoSlug.localeCompare(b.repoSlug))) {
      const icon = statusIcon(t.status);
      console.log(`  ${icon} ${t.repoSlug} issue#${t.issueNumber}  [${t.status}]  started=${t.startedAt}`);
    }
  }
}

async function cmdReview(repoSlug: string, prNumberStr: string): Promise<void> {
  const [owner, repo] = repoSlug.split("/");
  if (!owner || !repo) {
    console.error("Expected <owner/repo>");
    process.exit(1);
  }
  const prNumber = parseInt(prNumberStr, 10);
  if (isNaN(prNumber)) {
    console.error(`Invalid PR number: ${prNumberStr}`);
    process.exit(1);
  }

  const config = loadConfig();
  const github = new GitHubClient(config.githubToken);
  const state = new StateStore();
  const controller = new CursorController({
    localCwd: config.localCwd,
    local: { settingSources: [] },
  });

  const pr = await github.getPR({ owner, repo }, prNumber);
  console.log(`[pr-agent] reviewing ${repoSlug}#${prNumber}: "${pr.title}"`);

  // Force-reset state so review always runs
  state.upsertPR({
    repoSlug,
    prNumber: pr.number,
    status: "pending",
    headSha: pr.headSha,
  });

  await processPR(pr, {
    controller,
    github,
    state,
    config,
    reviewTemplate: prReviewTemplate,
    followUpTemplate: prFollowUpTemplate,
    log: (msg) => console.log(msg),
  });
}

function statusIcon(status: string): string {
  switch (status) {
    case "merged":
    case "done":
      return "✓";
    case "reviewing":
    case "implementing":
      return "⟳";
    case "reviewed":
      return "●";
    case "follow_up":
      return "↻";
    case "error":
      return "✗";
    case "skipped":
      return "–";
    default:
      return "·";
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) usage();

  const cmd = args[0];

  try {
    if (cmd === "daemon") {
      await cmdDaemon();
    } else if (cmd === "cycle") {
      await cmdCycle();
    } else if (cmd === "status") {
      await cmdStatus();
    } else if (cmd === "review") {
      if (args.length < 3) usage();
      await cmdReview(args[1], args[2]);
    } else {
      usage();
    }
  } catch (err) {
    if (err instanceof CursorAgentError) {
      console.error(`[pr-agent] SDK error: ${err.message}`);
      process.exitCode = 1;
    } else {
      console.error(`[pr-agent] fatal: ${String(err)}`);
      process.exitCode = 1;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
