/**
 * Mobile task-ingestion workflow.
 * Polls GitHub issues with the configured label, runs an implementation agent,
 * and closes the issue when the agent opens a PR.
 */
import type { CursorController } from "../controller/index.js";
import type { GitHubClient } from "../github/client.js";
import type { GitHubIssue } from "../github/types.js";
import type { PRTaskTemplate } from "../templates/pr-agent.js";
import type { LoopConfig } from "./config.js";
import { StateStore } from "./state.js";

export type TaskProcessorDeps = {
  controller: CursorController;
  github: GitHubClient;
  state: StateStore;
  config: LoopConfig;
  taskTemplate: PRTaskTemplate;
  log: (msg: string) => void;
};

function repoSlug(issue: GitHubIssue): string {
  return `${issue.repoCoord.owner}/${issue.repoCoord.repo}`;
}

export async function processTask(issue: GitHubIssue, deps: TaskProcessorDeps): Promise<void> {
  const slug = repoSlug(issue);

  const existing = deps.state.getTask(slug, issue.number);
  if (existing && (existing.status === "done" || existing.status === "implementing")) {
    deps.log(`[${slug} issue#${issue.number}] already ${existing.status}, skipping`);
    return;
  }

  deps.log(`[${slug} issue#${issue.number}] implementing: "${issue.title}"`);

  deps.state.upsertTask({
    repoSlug: slug,
    issueNumber: issue.number,
    status: "implementing",
    startedAt: new Date().toISOString(),
  });

  const prompt = deps.taskTemplate.buildPrompt({
    issue,
    repoUrl: deps.config.cloudRepoUrl,
  });

  try {
    const agentOptions = deps.config.cloudRepoUrl
      ? { cloud: { repos: [{ url: deps.config.cloudRepoUrl }] } }
      : undefined;

    const result = await deps.controller.runTemplate(
      { id: "pr-task", description: "Implement issue", buildPrompt: () => prompt },
      {
        runtime: deps.config.cloudRepoUrl ? "cloud" : "local",
        ...(agentOptions ?? {}),
      },
    );

    if (result.status === "error") {
      deps.log(`[${slug} issue#${issue.number}] agent error, will retry next cycle`);
      deps.state.upsertTask({
        repoSlug: slug,
        issueNumber: issue.number,
        status: "error",
        startedAt: existing?.startedAt ?? new Date().toISOString(),
        doneAt: new Date().toISOString(),
        lastRunId: result.id,
      });
      return;
    }

    // Close the issue with a reference to the agent run
    await deps.github.closeIssue({
      ...issue.repoCoord,
      issueNumber: issue.number,
    });

    await deps.github.postComment({
      ...issue.repoCoord,
      issueNumber: issue.number,
      body: [
        `Agent task completed. Run id: \`${result.id ?? "n/a"}\``,
        "",
        result.result?.trim() ?? "(no summary from agent)",
      ].join("\n"),
    });

    deps.state.upsertTask({
      repoSlug: slug,
      issueNumber: issue.number,
      status: "done",
      startedAt: existing?.startedAt ?? new Date().toISOString(),
      doneAt: new Date().toISOString(),
      lastRunId: result.id,
    });

    deps.log(`[${slug} issue#${issue.number}] done`);
  } catch (err) {
    deps.log(`[${slug} issue#${issue.number}] error: ${String(err)}`);
    deps.state.upsertTask({
      repoSlug: slug,
      issueNumber: issue.number,
      status: "error",
      startedAt: existing?.startedAt ?? new Date().toISOString(),
      doneAt: new Date().toISOString(),
    });
  }
}
