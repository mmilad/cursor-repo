/**
 * Runtime configuration for the PR-agent loop.
 * All values come from environment variables (see .env.example).
 */
import "../../src/load-env.js";

export type LoopConfig = {
  cursorApiKey: string;
  githubToken: string;
  /** Comma-separated "owner/repo" pairs. */
  repos: Array<{ owner: string; repo: string }>;
  /** Cron expression; default: every 5 minutes. */
  cronExpression: string;
  /** Require this many approvals before auto-merging. */
  requiredApprovals: number;
  /** Auto-merge after approval threshold is met. */
  autoMerge: boolean;
  /** Label on GitHub issues to treat as agent tasks. */
  taskLabel: string;
  /** Cloud repo URL passed to cloud agents. */
  cloudRepoUrl?: string;
  /** Max PRs processed concurrently per cycle. */
  concurrencyLimit: number;
  /** Absolute path that CursorController localCwd should point at. */
  localCwd: string;
};

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function parseRepos(raw: string): Array<{ owner: string; repo: string }> {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((slug) => {
      const [owner, repo] = slug.split("/");
      if (!owner || !repo) throw new Error(`Invalid GITHUB_REPOS entry "${slug}": must be "owner/repo"`);
      return { owner, repo };
    });
}

export function loadConfig(): LoopConfig {
  return {
    cursorApiKey: requireEnv("CURSOR_API_KEY"),
    githubToken: requireEnv("GITHUB_TOKEN"),
    repos: parseRepos(requireEnv("GITHUB_REPOS")),
    cronExpression: optionalEnv("LOOP_CRON", "*/5 * * * *"),
    requiredApprovals: parseInt(optionalEnv("REQUIRED_APPROVALS", "1"), 10),
    autoMerge: optionalEnv("AUTO_MERGE", "false") === "true",
    taskLabel: optionalEnv("TASK_LABEL", "agent-task"),
    cloudRepoUrl: process.env.CURSOR_CLOUD_REPO_URL?.trim() || undefined,
    concurrencyLimit: parseInt(optionalEnv("CONCURRENCY_LIMIT", "3"), 10),
    localCwd: optionalEnv("LOCAL_CWD", process.cwd()),
  };
}
