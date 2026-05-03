/**
 * Main loop scheduler.
 *
 * Uses croner for reliable cron-style scheduling. Runs one full cycle
 * (scan PRs + scan task issues across all configured repos) every
 * POLL_INTERVAL_MINUTES minutes, with concurrency capped at
 * MAX_CONCURRENT_AGENTS.
 */

import { Cron } from "croner";
import type { Config } from "../config.js";
import { GitHubClient } from "../github/client.js";
import { PRProcessor } from "./pr-processor.js";
import { TaskProcessor } from "./task-processor.js";
import { StateManager } from "../utils/state.js";
import { log } from "../utils/logger.js";

export class AgentLoopScheduler {
  private config: Config;
  private state: StateManager;
  private github: GitHubClient;
  private prProcessor: PRProcessor;
  private taskProcessor: TaskProcessor;
  private running = false;
  private job: Cron | null = null;

  constructor(config: Config, state: StateManager) {
    this.config = config;
    this.state = state;
    this.github = new GitHubClient(config);
    this.prProcessor = new PRProcessor(config, state);
    this.taskProcessor = new TaskProcessor(config, state);
  }

  /**
   * Start the scheduler. Runs an immediate cycle, then schedules
   * recurring cycles based on config.pollIntervalMinutes.
   */
  async start(): Promise<void> {
    log.info(
      `Starting agent loop (interval: ${this.config.pollIntervalMinutes}m, ` +
        `repos: ${this.config.githubRepos.join(", ")})`
    );

    // Run immediately on startup
    await this.runCycle();

    const cronExpr = `*/${this.config.pollIntervalMinutes} * * * *`;
    this.job = new Cron(cronExpr, { name: "pr-agent-loop" }, async () => {
      await this.runCycle();
    });

    log.info(`Scheduler running on "${cronExpr}". Press Ctrl+C to stop.`);
  }

  stop(): void {
    this.job?.stop();
    log.info("Scheduler stopped");
  }

  /**
   * Run one full cycle: for each repo, scan task issues then open PRs.
   */
  async runCycle(): Promise<void> {
    if (this.running) {
      log.warn("Previous cycle still running – skipping this tick");
      return;
    }

    this.running = true;
    const start = Date.now();
    log.info("=== Cycle start ===");

    try {
      for (const repo of this.config.githubRepos) {
        await this.processRepo(repo);
      }
    } catch (err) {
      log.error(`Cycle error: ${String(err)}`);
    } finally {
      await this.state.save();
      this.running = false;
      log.info(`=== Cycle done in ${((Date.now() - start) / 1000).toFixed(1)}s ===`);
    }
  }

  private async processRepo(repo: string): Promise<void> {
    log.info(`--- Repo: ${repo} ---`);

    // 1. Pick up new tasks from issues
    try {
      await this.taskProcessor.processAll(repo);
    } catch (err) {
      log.error(`Task scan failed for ${repo}: ${String(err)}`);
    }

    // 2. Scan open PRs
    let prs;
    try {
      prs = await this.github.listOpenPRs(repo);
    } catch (err) {
      log.error(`PR scan failed for ${repo}: ${String(err)}`);
      return;
    }

    log.info(`${prs.length} open PR(s) in ${repo}`);

    // Cap concurrency using a simple semaphore approach
    const pending = [...prs];
    const concurrency = this.config.maxConcurrentAgents;

    while (pending.length > 0) {
      const batch = pending.splice(0, concurrency);
      await Promise.all(batch.map((pr) => this.prProcessor.process(pr)));
    }
  }
}
