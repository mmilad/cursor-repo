import "dotenv/config";
import { z } from "zod";

const ConfigSchema = z.object({
  cursorApiKey: z.string().min(1, "CURSOR_API_KEY is required"),
  githubToken: z.string().min(1, "GITHUB_TOKEN is required"),
  githubRepos: z
    .string()
    .min(1, "GITHUB_REPOS is required")
    .transform((v): string[] =>
      v
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean)
    ),
  cursorModel: z.string().default("composer-2"),
  pollIntervalMinutes: z.coerce.number().int().positive().default(5),
  maxConcurrentAgents: z.coerce.number().int().positive().default(3),
  autoMerge: z
    .string()
    .transform((v): boolean => v === "true")
    .default("false"),
  mergeMethod: z.enum(["merge", "squash", "rebase"]).default("squash"),
  requiredApprovals: z.coerce.number().int().min(0).default(1),
  taskLabel: z.string().default("agent-task"),
  stateFile: z.string().default(".agent-state.json"),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof ConfigSchema>;

function loadConfig(): Config {
  const result = ConfigSchema.safeParse({
    cursorApiKey: process.env.CURSOR_API_KEY,
    githubToken: process.env.GITHUB_TOKEN,
    githubRepos: process.env.GITHUB_REPOS,
    cursorModel: process.env.CURSOR_MODEL,
    pollIntervalMinutes: process.env.POLL_INTERVAL_MINUTES,
    maxConcurrentAgents: process.env.MAX_CONCURRENT_AGENTS,
    autoMerge: process.env.AUTO_MERGE,
    mergeMethod: process.env.MERGE_METHOD,
    requiredApprovals: process.env.REQUIRED_APPROVALS,
    taskLabel: process.env.TASK_LABEL,
    stateFile: process.env.STATE_FILE,
    logLevel: process.env.LOG_LEVEL,
  });

  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuration error:\n${errors}`);
  }

  return result.data;
}

// Singleton – loaded once at startup
let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}
