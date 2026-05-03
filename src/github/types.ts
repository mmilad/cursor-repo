/**
 * Shared domain types for GitHub objects used across the PR-agent loop.
 */

export type RepoCoord = {
  owner: string;
  repo: string;
};

export type PullRequest = {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  headRef: string;
  baseRef: string;
  headSha: string;
  author: string;
  url: string;
  body: string | null;
  createdAt: string;
  updatedAt: string;
  repoCoord: RepoCoord;
  /** True when auto-merge is already armed on GitHub side. */
  autoMergeEnabled: boolean;
  /** Number of approvals at fetch time. */
  approvalCount: number;
  /** Whether any reviewer requested changes. */
  changesRequested: boolean;
  /** Whether the PR has unresolved review threads. */
  hasUnresolvedThreads: boolean;
  /** Whether CI checks all pass (or there are none). */
  checksPass: boolean | null;
};

export type GitHubReview = {
  id: number;
  author: string;
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING";
  body: string;
  submittedAt: string | null;
};

export type GitHubIssue = {
  number: number;
  title: string;
  body: string | null;
  labels: string[];
  author: string;
  createdAt: string;
  url: string;
  repoCoord: RepoCoord;
};

export type PostReviewParams = RepoCoord & {
  pullNumber: number;
  commitId: string;
  body: string;
  /** GitHub review event type. */
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
};

export type PostCommentParams = RepoCoord & {
  issueNumber: number;
  body: string;
};

export type MergePullRequestParams = RepoCoord & {
  pullNumber: number;
  commitTitle?: string;
  mergeMethod?: "merge" | "squash" | "rebase";
};

export type CreateIssueParams = RepoCoord & {
  title: string;
  body: string;
  labels?: string[];
};

export type CloseIssueParams = RepoCoord & {
  issueNumber: number;
};
