/**
 * Task Processor
 *
 * Picks up GitHub Issues labelled with `config.taskLabel` (default: "agent-task"),
 * dispatches each to a cloud agent, and closes the issue once the agent opens a PR.
 *
 * This is the "mobile ingestion" path: create a GitHub issue from your phone
 * → the agent loop picks it up automatically in the next cycle.
 */

import type { Config } from "../config.js";
import type { RepoIssue } from "../github/client.js";
import { GitHubClient } from "../github/client.js";
import { CursorAgentRunner } from "../cursor/agent.js";
import { buildTaskPrompt } from "../cursor/prompts.js";
import { StateManager } from "../utils/state.js";
import { log } from "../utils/logger.js";

export class TaskProcessor {
  private github: GitHubClient;
  private cursor: CursorAgentRunner;
  private state: StateManager;
  private config: Config;

  constructor(config: Config, state: StateManager) {
    this.config = config;
    this.github = new GitHubClient(config);
    this.cursor = new CursorAgentRunner(config);
    this.state = state;
  }

  private taskKey(issue: RepoIssue): string {
    return `task:${issue.repoFullName}#${issue.number}`;
  }

  async processAll(repoFullName: string): Promise<void> {
    const issues = await this.github.listLabeledIssues(
      repoFullName,
      this.config.taskLabel
    );

    if (issues.length === 0) {
      log.debug(`No ${this.config.taskLabel} issues in ${repoFullName}`);
      return;
    }

    log.info(`Found ${issues.length} task issue(s) in ${repoFullName}`);

    for (const issue of issues) {
      await this.process(issue);
    }
  }

  async process(issue: RepoIssue): Promise<void> {
    const key = this.taskKey(issue);
    let taskState = this.state.getTask(key);

    if (taskState?.status === "done" || taskState?.status === "running") {
      log.debug(`Task ${key} already handled (${taskState.status})`);
      return;
    }

    if (!taskState) {
      taskState = {
        issueUrl: issue.url,
        issueNumber: issue.number,
        repoFullName: issue.repoFullName,
        title: issue.title,
        body: issue.body ?? "",
        status: "pending",
        lastUpdated: new Date().toISOString(),
      };
      this.state.setTask(key, taskState);
    }

    log.info(`Dispatching task: [${issue.repoFullName}#${issue.number}] ${issue.title}`);

    this.state.updateTask(key, { status: "running" });

    const repoUrl = `https://github.com/${issue.repoFullName}`;
    const prompt = buildTaskPrompt(repoUrl, issue.title, issue.body ?? "");

    try {
      // Comment on the issue so the author knows it was picked up
      await this.github.postComment(
        issue.repoFullName,
        issue.number,
        `🤖 **Agent dispatched** – I'm working on this task now. I'll update this issue when a PR is ready.`
      );

      const result = await this.cursor.runCloudAgent({
        repoUrl,
        startingRef: "main",
        prompt,
        autoCreatePR: true,
      });

      if (result.status === "finished") {
        const prLink = result.prUrl ? `\nPR: ${result.prUrl}` : "";
        await this.github.closeIssue(
          issue.repoFullName,
          issue.number,
          `✅ **Task completed by agent**${prLink}\n\nSummary:\n${result.output.slice(0, 2000)}`
        );
        this.state.updateTask(key, {
          status: "done",
          agentId: result.agentId,
          prUrl: result.prUrl,
        });
        log.success(`Task ${key} done${result.prUrl ? ` → ${result.prUrl}` : ""}`);
      } else {
        this.state.updateTask(key, {
          status: "error",
          errorMessage: `Agent ended with status: ${result.status}`,
        });
        await this.github.postComment(
          issue.repoFullName,
          issue.number,
          `⚠️ Agent run ended with status \`${result.status}\`. Please check the Cursor dashboard or re-label the issue to retry.`
        );
      }
    } catch (err) {
      log.error(`Task ${key} failed: ${String(err)}`);
      this.state.updateTask(key, {
        status: "error",
        errorMessage: String(err),
      });
      try {
        await this.github.postComment(
          issue.repoFullName,
          issue.number,
          `❌ Agent dispatch failed: ${String(err)}\n\nRe-label the issue with \`${this.config.taskLabel}\` to retry.`
        );
      } catch {
        /* ignore comment failure */
      }
    }
  }
}
