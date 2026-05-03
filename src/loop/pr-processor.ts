/**
 * PR Processor
 *
 * Implements the state machine for a single open PR:
 *
 *   pending → reviewing → reviewed
 *                              ↓
 *              (approved + mergeable) → merging → merged
 *                              ↓
 *              (follow-up tasks)     → follow_up → reviewed (loop back)
 *                              ↓
 *              (open questions)      → reviewed (re-trigger later after author responds)
 */

import type { Config } from "../config.js";
import type { RepoPR } from "../github/client.js";
import { GitHubClient } from "../github/client.js";
import type { AgentRunResult } from "../cursor/agent.js";
import { CursorAgentRunner } from "../cursor/agent.js";
import {
  buildFollowUpPrompt,
  buildRefinementPrompt,
  buildReviewPrompt,
  parseReviewResult,
} from "../cursor/prompts.js";
import type { PRState } from "../utils/state.js";
import { StateManager } from "../utils/state.js";
import { log } from "../utils/logger.js";

export class PRProcessor {
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

  private prKey(pr: RepoPR): string {
    return `${pr.repoFullName}#${pr.number}`;
  }

  private repoUrl(repoFullName: string): string {
    return `https://github.com/${repoFullName}`;
  }

  /**
   * Main entry point. Processes one PR through the state machine.
   * Returns true if the PR was fully handled (merged or in a wait state).
   */
  async process(pr: RepoPR): Promise<void> {
    const key = this.prKey(pr);
    let prState = this.state.getPR(key);

    if (!prState) {
      prState = {
        prUrl: pr.url,
        repoFullName: pr.repoFullName,
        prNumber: pr.number,
        status: "pending",
        followUpTasks: [],
        lastUpdated: new Date().toISOString(),
      };
      this.state.setPR(key, prState);
    }

    // Skip already-done PRs
    if (prState.status === "merged" || prState.status === "skipped") return;

    // Skip while an agent is still running
    if (prState.status === "reviewing" || prState.status === "follow_up" || prState.status === "merging") {
      log.debug(`PR ${key} is currently in-flight (${prState.status}), skipping`);
      return;
    }

    log.info(`Processing PR ${key} (${prState.status}): ${pr.title}`);

    try {
      switch (prState.status) {
        case "pending":
        case "error":
          await this.runReview(pr, prState);
          break;

        case "reviewed":
          await this.afterReview(pr, prState);
          break;
      }
    } catch (err) {
      log.error(`Error processing PR ${key}: ${String(err)}`);
      this.state.updatePR(key, {
        status: "error",
        errorMessage: String(err),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Review phase
  // -------------------------------------------------------------------------

  private async runReview(pr: RepoPR, prState: PRState): Promise<void> {
    const key = this.prKey(pr);

    this.state.updatePR(key, { status: "reviewing" });

    const prompt = buildReviewPrompt(pr);
    let result: AgentRunResult;

    try {
      result = await this.cursor.runCloudAgent({
        repoUrl: this.repoUrl(pr.repoFullName),
        startingRef: pr.headRef,
        prompt,
        autoCreatePR: false,
      });
    } catch (err) {
      this.state.updatePR(key, { status: "error", errorMessage: String(err) });
      throw err;
    }

    const parsed = parseReviewResult(result.output);

    // Post the review on GitHub
    if (parsed.requestChanges) {
      await this.github.requestChanges(
        pr.repoFullName,
        pr.number,
        parsed.reviewBody
      );
    } else if (parsed.approved) {
      await this.github.postReview(
        pr.repoFullName,
        pr.number,
        parsed.reviewBody,
        true
      );
    } else {
      await this.github.postReview(
        pr.repoFullName,
        pr.number,
        parsed.reviewBody,
        false
      );
    }

    this.state.updatePR(key, {
      status: "reviewed",
      agentId: result.agentId,
      reviewComment: parsed.reviewBody,
      followUpTasks: parsed.followUpTasks,
    });

    log.success(
      `Review complete for ${key}: approved=${parsed.approved} questions=${parsed.hasOpenQuestions} followUps=${parsed.followUpTasks.length}`
    );
  }

  // -------------------------------------------------------------------------
  // Post-review phase
  // -------------------------------------------------------------------------

  private async afterReview(pr: RepoPR, prState: PRState): Promise<void> {
    const key = this.prKey(pr);

    // Re-fetch current PR state to check current approval count
    const freshPRs = await this.github.listOpenPRs(pr.repoFullName);
    const freshPR = freshPRs.find((p) => p.number === pr.number);

    if (!freshPR) {
      // PR was closed externally
      this.state.updatePR(key, { status: "merged" });
      log.info(`PR ${key} was closed externally`);
      return;
    }

    const meetsApprovalThreshold =
      freshPR.approvalCount >= this.config.requiredApprovals;

    // Run follow-up tasks if any
    if (prState.followUpTasks && prState.followUpTasks.length > 0) {
      await this.runFollowUps(freshPR, prState);
      return;
    }

    // Attempt auto-merge if enabled and conditions are met
    if (
      this.config.autoMerge &&
      meetsApprovalThreshold &&
      freshPR.reviewDecision !== "CHANGES_REQUESTED"
    ) {
      await this.tryMerge(freshPR, prState);
      return;
    }

    if (!this.config.autoMerge) {
      log.info(`PR ${key}: review complete, auto-merge disabled – leaving for human`);
    } else if (!meetsApprovalThreshold) {
      log.info(
        `PR ${key}: waiting for ${this.config.requiredApprovals} approval(s), currently ${freshPR.approvalCount}`
      );
    }
  }

  // -------------------------------------------------------------------------
  // Follow-up tasks
  // -------------------------------------------------------------------------

  private async runFollowUps(pr: RepoPR, prState: PRState): Promise<void> {
    const key = this.prKey(pr);
    const tasks = [...(prState.followUpTasks ?? [])];

    log.info(`Running ${tasks.length} follow-up task(s) for ${key}`);

    this.state.updatePR(key, { status: "follow_up", followUpTasks: tasks });

    for (const task of tasks) {
      log.info(`  Follow-up: ${task.slice(0, 80)}`);

      let prompt: string;
      if (task.toLowerCase().includes("review feedback") || task.toLowerCase().includes("address")) {
        prompt = buildRefinementPrompt(pr, prState.reviewComment ?? task);
      } else {
        prompt = buildFollowUpPrompt(pr, task);
      }

      try {
        const result = await this.cursor.runCloudAgent({
          repoUrl: `https://github.com/${pr.repoFullName}`,
          startingRef: pr.headRef,
          prompt,
          autoCreatePR: false,
        });

        if (result.status === "finished") {
          await this.github.postComment(
            pr.repoFullName,
            pr.number,
            `**Automated follow-up completed** ✅\n\nTask: ${task}\n\nSummary:\n${result.output.slice(0, 2000)}`
          );
        } else {
          log.warn(`Follow-up agent for ${key} ended with status: ${result.status}`);
        }
      } catch (err) {
        log.error(`Follow-up failed for ${key}: ${String(err)}`);
      }
    }

    // Clear follow-up tasks and go back to reviewed state for potential merge
    this.state.updatePR(key, { status: "reviewed", followUpTasks: [] });
  }

  // -------------------------------------------------------------------------
  // Auto-merge
  // -------------------------------------------------------------------------

  private async tryMerge(pr: RepoPR, prState: PRState): Promise<void> {
    const key = this.prKey(pr);

    // Final mergeability check
    const mergeable = await this.github.checkMergeable(pr.repoFullName, pr.number);
    if (!mergeable) {
      log.warn(`PR ${key} is not mergeable – skipping auto-merge`);
      await this.github.postComment(
        pr.repoFullName,
        pr.number,
        "⚠️ Auto-merge skipped: PR has merge conflicts. Please resolve them."
      );
      return;
    }

    this.state.updatePR(key, { status: "merging" });

    const merged = await this.github.mergePR(
      pr.repoFullName,
      pr.number,
      this.config.mergeMethod,
      `${pr.title} (#${pr.number})`
    );

    if (merged) {
      this.state.updatePR(key, { status: "merged" });
    } else {
      this.state.updatePR(key, { status: "error", errorMessage: "Merge failed" });
    }
  }
}
