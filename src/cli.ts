#!/usr/bin/env node
/**
 * CLI tool for manual / one-shot operations.
 *
 * Usage:
 *   npx tsx src/cli.ts cycle              # run one full cycle now
 *   npx tsx src/cli.ts review <prUrl>     # review a specific PR
 *   npx tsx src/cli.ts task <repo> <num>  # dispatch a specific issue as task
 *   npx tsx src/cli.ts status             # print current state summary
 *   npx tsx src/cli.ts daemon             # start the scheduled loop
 */

import { getConfig } from "./config.js";
import { setLogLevel } from "./utils/logger.js";
import { StateManager } from "./utils/state.js";
import { AgentLoopScheduler } from "./loop/scheduler.js";
import { GitHubClient } from "./github/client.js";
import { PRProcessor } from "./loop/pr-processor.js";
import { TaskProcessor } from "./loop/task-processor.js";
import { log } from "./utils/logger.js";
import chalk from "chalk";

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;

  const config = getConfig();
  setLogLevel(config.logLevel);

  const state = new StateManager(config.stateFile);
  await state.load();

  switch (command) {
    case "daemon":
      await runDaemon(config, state);
      break;

    case "cycle": {
      const scheduler = new AgentLoopScheduler(config, state);
      await scheduler.runCycle();
      break;
    }

    case "review": {
      const prUrl = args[0];
      if (!prUrl) {
        console.error("Usage: cli review <prUrl>");
        process.exit(1);
      }
      await reviewSpecificPR(config, state, prUrl);
      break;
    }

    case "task": {
      const [repo, issueNumStr] = args;
      if (!repo || !issueNumStr) {
        console.error("Usage: cli task <owner/repo> <issueNumber>");
        process.exit(1);
      }
      await dispatchTask(config, state, repo, parseInt(issueNumStr, 10));
      break;
    }

    case "status":
      printStatus(state);
      break;

    default:
      printHelp();
  }

  await state.save();
}

async function runDaemon(
  config: ReturnType<typeof getConfig>,
  state: StateManager
): Promise<void> {
  const scheduler = new AgentLoopScheduler(config, state);

  process.on("SIGINT", () => {
    scheduler.stop();
    state.save().then(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    scheduler.stop();
    state.save().then(() => process.exit(0));
  });

  await scheduler.start();
}

async function reviewSpecificPR(
  config: ReturnType<typeof getConfig>,
  state: StateManager,
  prUrl: string
): Promise<void> {
  // Extract owner/repo and PR number from URL
  const match = prUrl.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  if (!match) {
    console.error("Invalid PR URL format. Expected: https://github.com/owner/repo/pull/123");
    process.exit(1);
  }
  const [, repoFullName, prNumStr] = match;
  const prNumber = parseInt(prNumStr, 10);

  const github = new GitHubClient(config);
  const prs = await github.listOpenPRs(repoFullName);
  const pr = prs.find((p) => p.number === prNumber);

  if (!pr) {
    console.error(`PR #${prNumber} not found or not open in ${repoFullName}`);
    process.exit(1);
  }

  const processor = new PRProcessor(config, state);
  // Force re-review by clearing state
  state.setPR(`${repoFullName}#${prNumber}`, {
    prUrl: pr.url,
    repoFullName,
    prNumber,
    status: "pending",
    followUpTasks: [],
    lastUpdated: new Date().toISOString(),
  });

  await processor.process(pr);
}

async function dispatchTask(
  config: ReturnType<typeof getConfig>,
  state: StateManager,
  repoFullName: string,
  issueNumber: number
): Promise<void> {
  const github = new GitHubClient(config);
  const issues = await github.listLabeledIssues(repoFullName, config.taskLabel);
  const issue = issues.find((i) => i.number === issueNumber);

  if (!issue) {
    // Try fetching without label filter by getting labelled issues broadly
    console.error(
      `Issue #${issueNumber} not found with label "${config.taskLabel}" in ${repoFullName}. ` +
        `Make sure the issue has the label applied.`
    );
    process.exit(1);
  }

  const processor = new TaskProcessor(config, state);
  await processor.process(issue);
}

function printStatus(state: StateManager): void {
  const prs = state.allPRs();
  const tasks = state.allTasks();

  console.log(chalk.bold("\n=== PR States ==="));
  if (prs.length === 0) {
    console.log("  (none tracked yet)");
  } else {
    const byStatus = groupBy(prs, (p) => p.status);
    for (const [status, items] of Object.entries(byStatus)) {
      const color =
        status === "merged"
          ? chalk.green
          : status === "error"
            ? chalk.red
            : status === "reviewing" || status === "follow_up"
              ? chalk.yellow
              : chalk.white;
      console.log(color(`\n  [${status}] (${items.length})`));
      for (const pr of items) {
        console.log(`    ${pr.repoFullName}#${pr.prNumber}`);
      }
    }
  }

  console.log(chalk.bold("\n=== Task States ==="));
  if (tasks.length === 0) {
    console.log("  (none tracked yet)");
  } else {
    const byStatus = groupBy(tasks, (t) => t.status);
    for (const [status, items] of Object.entries(byStatus)) {
      console.log(`\n  [${status}] (${items.length})`);
      for (const t of items) {
        console.log(`    ${t.repoFullName}#${t.issueNumber}: ${t.title}`);
      }
    }
  }

  console.log("");
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of arr) {
    const k = key(item);
    (out[k] ??= []).push(item);
  }
  return out;
}

function printHelp(): void {
  console.log(`
${chalk.bold("cursor-pr-agent")} – Autonomous PR review & follow-up loop

${chalk.bold("Commands:")}
  daemon                          Start the scheduled daemon loop
  cycle                           Run one full cycle immediately
  review <prUrl>                  Review a specific PR by URL
  task <owner/repo> <issueNum>    Dispatch a labeled issue as an agent task
  status                          Print current state summary

${chalk.bold("Examples:")}
  npx tsx src/cli.ts daemon
  npx tsx src/cli.ts review https://github.com/owner/repo/pull/42
  npx tsx src/cli.ts task owner/repo 7
  npx tsx src/cli.ts status

Configure via environment variables (see .env.example).
`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
