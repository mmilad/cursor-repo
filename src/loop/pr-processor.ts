/**
 * PR state machine: for each open PR, decide and execute the right agent action.
 *
 * State transitions:
 *   pending → reviewing  (launch review agent)
 *   reviewing → reviewed (review posted)
 *   reviewed → merging   (approvals met, auto-merge enabled)
 *   reviewed → follow_up (changes requested or review notes indicate follow-up needed)
 *   follow_up → reviewed (follow-up agent finishes)
 *   merging → merged     (merge succeeded)
 */
import type { CursorController } from "../controller/index.js";
import type { GitHubClient } from "../github/client.js";
import type { PullRequest } from "../github/types.js";
import type { PRReviewTemplate, PRFollowUpTemplate } from "../templates/pr-agent.js";
import type { LoopConfig } from "./config.js";
import { StateStore } from "./state.js";
import type { PRRecord, PRStatus } from "./state.js";

export type PRProcessorDeps = {
  controller: CursorController;
  github: GitHubClient;
  state: StateStore;
  config: LoopConfig;
  reviewTemplate: PRReviewTemplate;
  followUpTemplate: PRFollowUpTemplate;
  log: (msg: string) => void;
};

function repoSlug(pr: PullRequest): string {
  return `${pr.repoCoord.owner}/${pr.repoCoord.repo}`;
}

async function runReview(pr: PullRequest, deps: PRProcessorDeps): Promise<void> {
  const slug = repoSlug(pr);
  deps.log(`[${slug}#${pr.number}] launching review agent`);

  deps.state.upsertPR({
    repoSlug: slug,
    prNumber: pr.number,
    status: "reviewing",
    headSha: pr.headSha,
  });

  const prompt = deps.reviewTemplate.buildPrompt({
    pr,
    repoUrl: deps.config.cloudRepoUrl,
  });

  const agentOptions = deps.config.cloudRepoUrl
    ? {
        cloud: { repos: [{ url: deps.config.cloudRepoUrl }] },
      }
    : undefined;

  const result = await deps.controller.runTemplate(
    { id: "pr-review", description: "PR review", buildPrompt: () => prompt },
    {
      runtime: deps.config.cloudRepoUrl ? "cloud" : "local",
      ...(agentOptions ?? {}),
    },
  );

  const notes = result.result?.trim() ?? "";

  // Parse agent output for review decision
  const decision = parseReviewDecision(notes);

  // Post GitHub review
  await deps.github.postReview({
    ...pr.repoCoord,
    pullNumber: pr.number,
    commitId: pr.headSha,
    body: notes,
    event: decision,
  });

  deps.state.upsertPR({
    repoSlug: slug,
    prNumber: pr.number,
    status: "reviewed",
    headSha: pr.headSha,
    reviewPostedAt: new Date().toISOString(),
    agentNotes: notes,
    lastRunId: result.id,
  });

  deps.log(`[${slug}#${pr.number}] review posted (${decision})`);
}

async function runFollowUp(pr: PullRequest, record: PRRecord, deps: PRProcessorDeps): Promise<void> {
  const slug = repoSlug(pr);
  deps.log(`[${slug}#${pr.number}] launching follow-up agent (attempt ${record.followUpCount + 1})`);

  deps.state.upsertPR({
    repoSlug: slug,
    prNumber: pr.number,
    status: "follow_up",
    headSha: pr.headSha,
  });

  const prompt = deps.followUpTemplate.buildPrompt({
    pr,
    reviewNotes: record.agentNotes,
    repoUrl: deps.config.cloudRepoUrl,
  });

  const agentOptions = deps.config.cloudRepoUrl
    ? {
        cloud: { repos: [{ url: deps.config.cloudRepoUrl }] },
      }
    : undefined;

  const result = await deps.controller.runTemplate(
    { id: "pr-follow-up", description: "PR follow-up", buildPrompt: () => prompt },
    {
      runtime: deps.config.cloudRepoUrl ? "cloud" : "local",
      ...(agentOptions ?? {}),
    },
  );

  deps.state.upsertPR({
    repoSlug: slug,
    prNumber: pr.number,
    status: "reviewed",
    headSha: pr.headSha,
    followUpCount: record.followUpCount + 1,
    agentNotes: result.result?.trim() ?? record.agentNotes,
    lastRunId: result.id,
  });

  deps.log(`[${slug}#${pr.number}] follow-up done`);
}

async function tryMerge(pr: PullRequest, deps: PRProcessorDeps): Promise<void> {
  const slug = repoSlug(pr);
  deps.log(`[${slug}#${pr.number}] merging`);

  deps.state.upsertPR({
    repoSlug: slug,
    prNumber: pr.number,
    status: "merging",
    headSha: pr.headSha,
  });

  await deps.github.mergePR({
    ...pr.repoCoord,
    pullNumber: pr.number,
    commitTitle: `${pr.title} (#${pr.number})`,
    mergeMethod: "squash",
  });

  deps.state.upsertPR({
    repoSlug: slug,
    prNumber: pr.number,
    status: "merged",
    headSha: pr.headSha,
  });

  deps.log(`[${slug}#${pr.number}] merged`);
}

/**
 * Parse a simple marker embedded in agent review output.
 * Agent is instructed to end with: `DECISION: APPROVE`, `DECISION: REQUEST_CHANGES`, or `DECISION: COMMENT`.
 */
function parseReviewDecision(notes: string): "APPROVE" | "REQUEST_CHANGES" | "COMMENT" {
  const match = notes.match(/DECISION:\s*(APPROVE|REQUEST_CHANGES|COMMENT)/i);
  if (match) {
    const d = match[1].toUpperCase();
    if (d === "APPROVE" || d === "REQUEST_CHANGES" || d === "COMMENT") return d;
  }
  return "COMMENT";
}

function needsFollowUp(record: PRRecord, pr: PullRequest): boolean {
  // Follow up if reviewer requested changes or if agent notes mention follow-up keywords
  if (pr.changesRequested) return true;
  const notes = record.agentNotes?.toLowerCase() ?? "";
  return (
    notes.includes("needs refactor") ||
    notes.includes("needs refinement") ||
    notes.includes("todo:") ||
    notes.includes("follow-up:") ||
    notes.includes("remaining tasks")
  );
}

function canMerge(pr: PullRequest, config: LoopConfig): boolean {
  if (!config.autoMerge) return false;
  if (pr.draft) return false;
  if (pr.changesRequested) return false;
  if (pr.approvalCount < config.requiredApprovals) return false;
  if (pr.checksPass === false) return false;
  return true;
}

/** Process a single PR through one state-machine step. */
export async function processPR(pr: PullRequest, deps: PRProcessorDeps): Promise<void> {
  const slug = repoSlug(pr);

  // Skip drafts
  if (pr.draft) {
    deps.log(`[${slug}#${pr.number}] skip (draft)`);
    return;
  }

  // Reset state if new commits were pushed
  deps.state.resetPRIfShaChanged(slug, pr.number, pr.headSha);

  let record = deps.state.getPR(slug, pr.number);

  if (!record) {
    record = deps.state.upsertPR({
      repoSlug: slug,
      prNumber: pr.number,
      status: "pending",
      headSha: pr.headSha,
    });
  }

  const status: PRStatus = record.status;

  switch (status) {
    case "pending":
      await runReview(pr, deps);
      break;

    case "reviewed": {
      if (needsFollowUp(record, pr) && record.followUpCount < 3) {
        await runFollowUp(pr, record, deps);
      } else if (canMerge(pr, deps.config)) {
        await tryMerge(pr, deps);
      } else {
        deps.log(`[${slug}#${pr.number}] reviewed — waiting (approvals: ${pr.approvalCount}/${deps.config.requiredApprovals})`);
      }
      break;
    }

    case "follow_up":
      // Previous follow-up is still in flight; skip until it resolves.
      deps.log(`[${slug}#${pr.number}] follow-up in progress, skipping`);
      break;

    case "reviewing":
      // Review in flight; skip.
      deps.log(`[${slug}#${pr.number}] review in progress, skipping`);
      break;

    case "merging":
      deps.log(`[${slug}#${pr.number}] merge in progress, skipping`);
      break;

    case "merged":
    case "skipped":
      deps.log(`[${slug}#${pr.number}] already ${status}`);
      break;
  }
}
