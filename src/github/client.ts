/**
 * GitHub API client wrapper.
 *
 * Thin layer over @octokit/rest that exposes exactly the operations
 * the agent loop needs: listing PRs, posting reviews, merging,
 * listing issues (mobile task ingestion), and commenting.
 */

import { Octokit } from "@octokit/rest";
import type { Config } from "../config.js";
import { log } from "../utils/logger.js";

export interface RepoPR {
  number: number;
  title: string;
  url: string;
  headRef: string;
  baseRef: string;
  headSha: string;
  author: string;
  draft: boolean;
  mergeable: boolean | null;
  labels: string[];
  reviewDecision: string | null;
  approvalCount: number;
  requestedReviewers: string[];
  body: string | null;
  createdAt: string;
  updatedAt: string;
  repoFullName: string;
}

export interface RepoIssue {
  number: number;
  title: string;
  body: string | null;
  url: string;
  labels: string[];
  repoFullName: string;
  createdAt: string;
}

export interface ReviewResult {
  approved: boolean;
  hasOpenQuestions: boolean;
  summary: string;
}

export class GitHubClient {
  private octokit: Octokit;

  constructor(config: Config) {
    this.octokit = new Octokit({ auth: config.githubToken });
  }

  private parseRepo(repo: string): { owner: string; repo: string } {
    const clean = repo.replace(/^https:\/\/github\.com\//, "");
    const [owner, name] = clean.split("/");
    if (!owner || !name) throw new Error(`Invalid repo format: ${repo}`);
    return { owner, repo: name };
  }

  /**
   * List all open, non-draft PRs for a repo.
   */
  async listOpenPRs(repoFullName: string): Promise<RepoPR[]> {
    const { owner, repo } = this.parseRepo(repoFullName);
    log.debug(`Fetching open PRs for ${repoFullName}`);

    const { data: prs } = await this.octokit.pulls.list({
      owner,
      repo,
      state: "open",
      per_page: 100,
    });

    const results: RepoPR[] = [];

    for (const pr of prs) {
      if (pr.draft) continue;

      // Fetch review counts separately
      let approvalCount = 0;
      let reviewDecision: string | null = null;
      try {
        const { data: reviews } = await this.octokit.pulls.listReviews({
          owner,
          repo,
          pull_number: pr.number,
        });
        approvalCount = reviews.filter((r) => r.state === "APPROVED").length;
        if (approvalCount > 0) reviewDecision = "APPROVED";
        if (reviews.some((r) => r.state === "CHANGES_REQUESTED")) {
          reviewDecision = "CHANGES_REQUESTED";
        }
      } catch {
        /* non-fatal */
      }

      results.push({
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        headRef: pr.head.ref,
        baseRef: pr.base.ref,
        headSha: pr.head.sha,
        author: pr.user?.login ?? "unknown",
        draft: pr.draft ?? false,
        mergeable: null, // populated lazily via checkMergeable
        labels: pr.labels.map((l) => (typeof l === "string" ? l : l.name ?? "")),
        reviewDecision,
        approvalCount,
        requestedReviewers: [
          ...(pr.requested_reviewers ?? []).map((r) =>
            "login" in r ? r.login : ""
          ),
          ...(pr.requested_teams ?? []).map((t) => t.name ?? ""),
        ].filter(Boolean),
        body: pr.body ?? null,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        repoFullName,
      });
    }

    return results;
  }

  /**
   * Post a review comment on a PR.
   * If approve=true the review is APPROVE, otherwise COMMENT.
   */
  async postReview(
    repoFullName: string,
    prNumber: number,
    body: string,
    approve: boolean
  ): Promise<void> {
    const { owner, repo } = this.parseRepo(repoFullName);
    await this.octokit.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      body,
      event: approve ? "APPROVE" : "COMMENT",
    });
    log.info(`Posted ${approve ? "APPROVE" : "COMMENT"} review on ${repoFullName}#${prNumber}`);
  }

  /**
   * Request changes on a PR.
   */
  async requestChanges(
    repoFullName: string,
    prNumber: number,
    body: string
  ): Promise<void> {
    const { owner, repo } = this.parseRepo(repoFullName);
    await this.octokit.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      body,
      event: "REQUEST_CHANGES",
    });
    log.info(`Requested changes on ${repoFullName}#${prNumber}`);
  }

  /**
   * Post a plain comment on a PR (issue comment).
   */
  async postComment(
    repoFullName: string,
    issueOrPrNumber: number,
    body: string
  ): Promise<void> {
    const { owner, repo } = this.parseRepo(repoFullName);
    await this.octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueOrPrNumber,
      body,
    });
    log.debug(`Comment posted on ${repoFullName}#${issueOrPrNumber}`);
  }

  /**
   * Merge a PR once it passes all conditions.
   */
  async mergePR(
    repoFullName: string,
    prNumber: number,
    method: "merge" | "squash" | "rebase",
    commitTitle?: string
  ): Promise<boolean> {
    const { owner, repo } = this.parseRepo(repoFullName);
    try {
      await this.octokit.pulls.merge({
        owner,
        repo,
        pull_number: prNumber,
        merge_method: method,
        commit_title: commitTitle,
      });
      log.success(`Merged ${repoFullName}#${prNumber} (${method})`);
      return true;
    } catch (err: unknown) {
      log.error(`Merge failed for ${repoFullName}#${prNumber}: ${String(err)}`);
      return false;
    }
  }

  /**
   * Re-check mergeability of a PR (GitHub computes this lazily).
   */
  async checkMergeable(repoFullName: string, prNumber: number): Promise<boolean> {
    const { owner, repo } = this.parseRepo(repoFullName);
    // GitHub may return null on first request; retry once after a short delay.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: pr } = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });
      if (pr.mergeable !== null) return pr.mergeable;
      await sleep(2000);
    }
    return false;
  }

  /**
   * Add a label to an issue or PR.
   */
  async addLabel(
    repoFullName: string,
    issueOrPrNumber: number,
    label: string
  ): Promise<void> {
    const { owner, repo } = this.parseRepo(repoFullName);
    try {
      await this.octokit.issues.addLabels({
        owner,
        repo,
        issue_number: issueOrPrNumber,
        labels: [label],
      });
    } catch {
      /* label may not exist – ignore */
    }
  }

  /**
   * Close an issue (used after a task issue is dispatched to an agent).
   */
  async closeIssue(repoFullName: string, issueNumber: number, comment?: string): Promise<void> {
    const { owner, repo } = this.parseRepo(repoFullName);
    if (comment) {
      await this.octokit.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: comment,
      });
    }
    await this.octokit.issues.update({
      owner,
      repo,
      issue_number: issueNumber,
      state: "closed",
    });
  }

  /**
   * List open issues with a specific label (mobile task ingestion).
   */
  async listLabeledIssues(repoFullName: string, label: string): Promise<RepoIssue[]> {
    const { owner, repo } = this.parseRepo(repoFullName);
    const { data } = await this.octokit.issues.listForRepo({
      owner,
      repo,
      state: "open",
      labels: label,
      per_page: 50,
    });

    return data
      .filter((i) => !i.pull_request) // exclude PR cross-refs
      .map((i) => ({
        number: i.number,
        title: i.title,
        body: i.body ?? null,
        url: i.html_url,
        labels: i.labels.map((l) => (typeof l === "string" ? l : l.name ?? "")),
        repoFullName,
        createdAt: i.created_at,
      }));
  }

  /**
   * Get the diff / files changed for a PR.
   */
  async getPRFiles(repoFullName: string, prNumber: number): Promise<string[]> {
    const { owner, repo } = this.parseRepo(repoFullName);
    const { data } = await this.octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });
    return data.map((f) => f.filename);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
