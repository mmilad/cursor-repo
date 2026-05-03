/**
 * Prompt templates for the PR-agent loop.
 *
 * Three templates:
 *   - PRReviewTemplate   — reviews an open PR and produces a structured decision
 *   - PRFollowUpTemplate — addresses review comments / requested changes
 *   - PRTaskTemplate     — implements a GitHub issue from scratch
 */
import type { PullRequest, GitHubIssue } from "../github/types.js";
import type { JobTemplate } from "../controller/types.js";

// ────────────────────────────── Review ──────────────────────────────

export type PRReviewInput = {
  pr: PullRequest;
  repoUrl?: string;
};

export type PRReviewTemplate = {
  buildPrompt: (input: PRReviewInput) => string;
};

export const prReviewTemplate: PRReviewTemplate = {
  buildPrompt({ pr, repoUrl }) {
    const repoLine = repoUrl ? `Repository: ${repoUrl}` : "";
    return [
      "You are a senior software engineer conducting a code review.",
      "Review the pull request described below thoroughly.",
      "",
      `## Pull Request`,
      `Title: ${pr.title}`,
      `Number: #${pr.number}`,
      `Author: ${pr.author}`,
      `Branch: ${pr.headRef} → ${pr.baseRef}`,
      `URL: ${pr.url}`,
      repoLine,
      "",
      pr.body ? `## Description\n${pr.body}` : "",
      "",
      "## Your review task",
      "1. Evaluate correctness, code quality, test coverage, and architectural fit.",
      "2. Identify any bugs, security issues, missing tests, needed refactors, or follow-up tasks.",
      "3. If changes are required, list them clearly under '## Requested Changes'.",
      "4. If there are follow-up tasks (refactor, new todos, etc.), list them under '## Follow-up Tasks'.",
      "5. End your review with exactly one of the following lines (nothing after it):",
      "   DECISION: APPROVE",
      "   DECISION: REQUEST_CHANGES",
      "   DECISION: COMMENT",
      "",
      "Use APPROVE only if the code is ready to merge without changes.",
      "Use REQUEST_CHANGES if changes are needed before merging.",
      "Use COMMENT for informational reviews that do not block merging.",
    ]
      .filter((l) => l !== null && l !== undefined)
      .join("\n");
  },
};

// ────────────────────────────── Follow-up ──────────────────────────────

export type PRFollowUpInput = {
  pr: PullRequest;
  reviewNotes?: string;
  repoUrl?: string;
};

export type PRFollowUpTemplate = {
  buildPrompt: (input: PRFollowUpInput) => string;
};

export const prFollowUpTemplate: PRFollowUpTemplate = {
  buildPrompt({ pr, reviewNotes, repoUrl }) {
    const repoLine = repoUrl ? `Repository: ${repoUrl}` : "";
    return [
      "You are a software engineer addressing review feedback on a pull request.",
      "Your job is to implement the changes requested in the review notes below.",
      "",
      `## Pull Request`,
      `Title: ${pr.title}`,
      `Number: #${pr.number}`,
      `Branch: ${pr.headRef}`,
      `URL: ${pr.url}`,
      repoLine,
      "",
      reviewNotes
        ? `## Review Notes\n${reviewNotes}`
        : "## Review Notes\n(none — address any obvious remaining issues)",
      "",
      "## Instructions",
      "1. Implement all requested changes and refactors.",
      "2. Add missing tests if mentioned.",
      "3. Complete any TODOs or follow-up tasks noted in the review.",
      "4. Commit with descriptive messages.",
      "5. Summarize what you changed at the end of your response.",
    ].join("\n");
  },
};

// ────────────────────────────── Task implementation ──────────────────────────────

export type PRTaskInput = {
  issue: GitHubIssue;
  repoUrl?: string;
};

export type PRTaskTemplate = {
  buildPrompt: (input: PRTaskInput) => string;
};

export const prTaskTemplate: PRTaskTemplate = {
  buildPrompt({ issue, repoUrl }) {
    const repoLine = repoUrl ? `Repository: ${repoUrl}` : "";
    return [
      "You are a software engineer implementing a task described in a GitHub issue.",
      "Implement the feature or fix described below, then open a pull request.",
      "",
      `## Issue`,
      `Title: ${issue.title}`,
      `Number: #${issue.number}`,
      `Author: ${issue.author}`,
      `URL: ${issue.url}`,
      repoLine,
      "",
      issue.body ? `## Issue Description\n${issue.body}` : "## Issue Description\n(no description)",
      "",
      "## Instructions",
      "1. Understand the requirement from the issue description.",
      "2. Implement the feature or fix with appropriate tests.",
      "3. Follow existing code style and conventions.",
      "4. Commit all changes with clear commit messages.",
      "5. Open a pull request referencing this issue.",
      "6. End your response with a brief summary of what was implemented.",
    ].join("\n");
  },
};

// ────────────────────────────── JobTemplate adapter ──────────────────────────────
// These adapters allow the templates to be used directly with CursorController.runTemplate()
// when a pre-built prompt string is passed as the goal variable.

export function makeRawPromptTemplate(id: string): JobTemplate {
  return {
    id,
    description: `Raw prompt adapter for ${id}`,
    buildPrompt: (variables) => String(variables.prompt ?? variables.goal ?? ""),
  };
}
