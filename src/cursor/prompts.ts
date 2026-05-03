/**
 * Prompt templates for the various agent tasks in the loop.
 *
 * Keeping prompts in one place makes them easy to iterate on without
 * touching the orchestration logic.
 */

import type { RepoPR } from "../github/client.js";

export interface ReviewAgentResult {
  approved: boolean;
  hasOpenQuestions: boolean;
  requestChanges: boolean;
  reviewBody: string;
  followUpTasks: string[];
}

/**
 * Parses the structured JSON block the review agent is asked to return.
 * Falls back gracefully if the model does not produce valid JSON.
 */
export function parseReviewResult(rawOutput: string): ReviewAgentResult {
  const jsonMatch = rawOutput.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]) as Partial<ReviewAgentResult>;
      return {
        approved: parsed.approved ?? false,
        hasOpenQuestions: parsed.hasOpenQuestions ?? false,
        requestChanges: parsed.requestChanges ?? false,
        reviewBody: parsed.reviewBody ?? rawOutput,
        followUpTasks: parsed.followUpTasks ?? [],
      };
    } catch {
      /* fall through */
    }
  }

  // Heuristic fallback
  const lower = rawOutput.toLowerCase();
  const approved =
    lower.includes("lgtm") ||
    lower.includes("approved") ||
    lower.includes("looks good");
  const hasOpenQuestions =
    lower.includes("?") ||
    lower.includes("question") ||
    lower.includes("clarif");

  return {
    approved,
    hasOpenQuestions,
    requestChanges: !approved,
    reviewBody: rawOutput,
    followUpTasks: [],
  };
}

export function buildReviewPrompt(pr: RepoPR): string {
  const changedFiles = pr.body ? `\nPR description:\n${pr.body}\n` : "";
  return `You are a senior software engineer performing a thorough code review.

Repository: ${pr.repoFullName}
PR #${pr.number}: ${pr.title}
Branch: ${pr.headRef} → ${pr.baseRef}
Author: ${pr.author}
${changedFiles}
Your task:
1. Review all changed files in this PR (use your file reading tools to inspect them).
2. Check for:
   - Correctness and logic errors
   - Code quality, readability, and maintainability
   - Security issues (injection, auth bypasses, exposed secrets, etc.)
   - Missing tests or inadequate test coverage
   - Performance concerns
   - API contract changes that need documentation updates
3. If there are open questions or unclear intentions, list them explicitly.
4. Identify any follow-up tasks (refactoring needs, new TODOs, refinements).

Return your review in the following format:

\`\`\`json
{
  "approved": <true if the PR is good to merge, false otherwise>,
  "hasOpenQuestions": <true if you have questions for the author>,
  "requestChanges": <true if changes are required before merging>,
  "reviewBody": "<full markdown review text to post as a GitHub review comment>",
  "followUpTasks": ["<task description 1>", "<task description 2>"]
}
\`\`\`

Be concise but thorough. If the PR is trivial (docs, config bumps), you may approve quickly.`;
}

export function buildFollowUpPrompt(
  pr: RepoPR,
  task: string
): string {
  return `You are a senior software engineer implementing a follow-up task that was identified during a code review.

Repository: ${pr.repoFullName}
Original PR #${pr.number}: ${pr.title}
Branch: ${pr.headRef}

Follow-up task:
${task}

Instructions:
1. Inspect the current state of the code in the branch ${pr.headRef}.
2. Implement the follow-up task directly on this branch.
3. Write or update tests as needed.
4. Commit your changes with a descriptive message.
5. Summarize what you did at the end.

Do NOT open a new PR — push directly to branch ${pr.headRef}.`;
}

export function buildTaskPrompt(
  repoUrl: string,
  issueTitle: string,
  issueBody: string
): string {
  return `You are a senior software engineer implementing a task created from a mobile device.

Repository: ${repoUrl}

Task: ${issueTitle}

Details:
${issueBody || "(no additional details provided)"}

Instructions:
1. Understand the task thoroughly before starting.
2. Explore the relevant parts of the codebase.
3. Implement the task following the existing code style and patterns.
4. Add or update tests.
5. Commit with a clear message.
6. A PR will be opened automatically when you complete your work.

Summarize your changes at the end.`;
}

export function buildRefinementPrompt(
  pr: RepoPR,
  feedback: string
): string {
  return `You are a senior software engineer addressing review feedback on a pull request.

Repository: ${pr.repoFullName}
PR #${pr.number}: ${pr.title}
Branch: ${pr.headRef}

Review feedback that needs to be addressed:
${feedback}

Instructions:
1. Read through the review feedback carefully.
2. Inspect the current state of the files mentioned.
3. Implement all requested changes.
4. Ensure existing tests still pass and add new tests where needed.
5. Commit your changes.
6. Do NOT open a new PR — push to branch ${pr.headRef}.
7. Post a brief summary of what you changed at the end so the reviewer can re-check.`;
}
