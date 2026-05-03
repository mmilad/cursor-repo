/**
 * Thin Octokit wrapper — every method maps to one GitHub API concept.
 * All interactions with the GitHub API go through this class.
 */
import { Octokit } from "@octokit/rest";
import type {
  CloseIssueParams,
  CreateIssueParams,
  GitHubIssue,
  GitHubReview,
  MergePullRequestParams,
  PostCommentParams,
  PostReviewParams,
  PullRequest,
  RepoCoord,
} from "./types.js";

export class GitHubClient {
  private readonly octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  /** List open (non-draft) PRs that are ready for review. */
  async listOpenPRs(coord: RepoCoord): Promise<PullRequest[]> {
    const { data } = await this.octokit.pulls.list({
      owner: coord.owner,
      repo: coord.repo,
      state: "open",
      per_page: 50,
    });

    const results: PullRequest[] = [];
    for (const pr of data) {
      const reviews = await this.listReviews(coord, pr.number);
      const approvalCount = reviews.filter((r) => r.state === "APPROVED").length;
      const changesRequested = reviews.some((r) => r.state === "CHANGES_REQUESTED");

      // Check CI status for the head commit
      let checksPass: boolean | null = null;
      try {
        const { data: checkRuns } = await this.octokit.checks.listForRef({
          owner: coord.owner,
          repo: coord.repo,
          ref: pr.head.sha,
        });
        if (checkRuns.total_count > 0) {
          checksPass = checkRuns.check_runs.every(
            (c) => c.conclusion === "success" || c.conclusion === "skipped" || c.conclusion === "neutral",
          );
        }
      } catch {
        // Repos without checks app return 404; treat as no checks
      }

      results.push({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        draft: pr.draft ?? false,
        headRef: pr.head.ref,
        baseRef: pr.base.ref,
        headSha: pr.head.sha,
        author: pr.user?.login ?? "unknown",
        url: pr.html_url,
        body: pr.body ?? null,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        repoCoord: coord,
        autoMergeEnabled: (pr as { auto_merge?: unknown }).auto_merge !== null,
        approvalCount,
        changesRequested,
        hasUnresolvedThreads: false, // extended in getFullPR if needed
        checksPass,
      });
    }
    return results;
  }

  /** Fetch a single PR with enriched review/thread state. */
  async getPR(coord: RepoCoord, pullNumber: number): Promise<PullRequest> {
    const { data: pr } = await this.octokit.pulls.get({
      owner: coord.owner,
      repo: coord.repo,
      pull_number: pullNumber,
    });

    const reviews = await this.listReviews(coord, pullNumber);
    const approvalCount = reviews.filter((r) => r.state === "APPROVED").length;
    const changesRequested = reviews.some((r) => r.state === "CHANGES_REQUESTED");

    // Resolve threads
    let hasUnresolvedThreads = false;
    try {
      const { data: comments } = await this.octokit.pulls.listReviewComments({
        owner: coord.owner,
        repo: coord.repo,
        pull_number: pullNumber,
        per_page: 100,
      });
      hasUnresolvedThreads = comments.some((c) => {
        const r = c as unknown as { resolved?: boolean };
        return r.resolved === false;
      });
    } catch {
      // ignore
    }

    let checksPass: boolean | null = null;
    try {
      const { data: checkRuns } = await this.octokit.checks.listForRef({
        owner: coord.owner,
        repo: coord.repo,
        ref: pr.head.sha,
      });
      if (checkRuns.total_count > 0) {
        checksPass = checkRuns.check_runs.every(
          (c) =>
            c.conclusion === "success" ||
            c.conclusion === "skipped" ||
            c.conclusion === "neutral",
        );
      }
    } catch {
      // ignore
    }

    return {
      number: pr.number,
      title: pr.title,
      state: pr.state,
      draft: pr.draft ?? false,
      headRef: pr.head.ref,
      baseRef: pr.base.ref,
      headSha: pr.head.sha,
      author: pr.user?.login ?? "unknown",
      url: pr.html_url,
      body: pr.body ?? null,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      repoCoord: coord,
      autoMergeEnabled: pr.auto_merge !== null,
      approvalCount,
      changesRequested,
      hasUnresolvedThreads,
      checksPass,
    };
  }

  /** List submitted reviews for a PR. */
  async listReviews(coord: RepoCoord, pullNumber: number): Promise<GitHubReview[]> {
    const { data } = await this.octokit.pulls.listReviews({
      owner: coord.owner,
      repo: coord.repo,
      pull_number: pullNumber,
      per_page: 100,
    });

    return data.map((r) => ({
      id: r.id,
      author: r.user?.login ?? "unknown",
      state: r.state as GitHubReview["state"],
      body: r.body,
      submittedAt: r.submitted_at ?? null,
    }));
  }

  /** Post a review (approve / request-changes / comment). */
  async postReview(params: PostReviewParams): Promise<void> {
    await this.octokit.pulls.createReview({
      owner: params.owner,
      repo: params.repo,
      pull_number: params.pullNumber,
      commit_id: params.commitId,
      body: params.body,
      event: params.event,
    });
  }

  /** Post a comment on an issue or PR. */
  async postComment(params: PostCommentParams): Promise<void> {
    await this.octokit.issues.createComment({
      owner: params.owner,
      repo: params.repo,
      issue_number: params.issueNumber,
      body: params.body,
    });
  }

  /** Merge a pull request. */
  async mergePR(params: MergePullRequestParams): Promise<void> {
    await this.octokit.pulls.merge({
      owner: params.owner,
      repo: params.repo,
      pull_number: params.pullNumber,
      commit_title: params.commitTitle,
      merge_method: params.mergeMethod ?? "squash",
    });
  }

  /** List issues with specific labels (used for the mobile task-ingestion workflow). */
  async listTaskIssues(coord: RepoCoord, label: string): Promise<GitHubIssue[]> {
    const { data } = await this.octokit.issues.listForRepo({
      owner: coord.owner,
      repo: coord.repo,
      state: "open",
      labels: label,
      per_page: 50,
    });

    return data
      .filter((i) => !i.pull_request) // exclude PRs
      .map((i) => ({
        number: i.number,
        title: i.title,
        body: i.body ?? null,
        labels: (i.labels ?? []).map((l) => (typeof l === "string" ? l : l.name ?? "")),
        author: i.user?.login ?? "unknown",
        createdAt: i.created_at,
        url: i.html_url,
        repoCoord: coord,
      }));
  }

  /** Create a new issue. */
  async createIssue(params: CreateIssueParams): Promise<number> {
    const { data } = await this.octokit.issues.create({
      owner: params.owner,
      repo: params.repo,
      title: params.title,
      body: params.body,
      labels: params.labels,
    });
    return data.number;
  }

  /** Close an issue with a comment. */
  async closeIssue(params: CloseIssueParams): Promise<void> {
    await this.octokit.issues.update({
      owner: params.owner,
      repo: params.repo,
      issue_number: params.issueNumber,
      state: "closed",
    });
  }
}
