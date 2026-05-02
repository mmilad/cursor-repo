import type {
  AgentOptions,
  CloudAgentOptions,
  LocalAgentOptions,
  ModelSelection,
} from "@cursor/sdk";

/** A named prompt you can register and pass `variables` into at run time. */
export type JobTemplate = {
  id: string;
  description?: string;
  buildPrompt: (variables: Record<string, unknown>) => string;
};

export type CursorRuntime = "local" | "cloud";

export type CursorControllerConfig = {
  /** Falls back to `process.env.CURSOR_API_KEY`. */
  apiKey?: string;
  /** Required for local runs unless overridden per call. */
  model?: ModelSelection;
  /** Default working directory for local agents and `listAgents({ runtime: "local" })`. */
  localCwd: string;
  local?: Omit<LocalAgentOptions, "cwd">;
  /** Default cloud options (e.g. repos) when a job does not override them. */
  cloudDefaults?: CloudAgentOptions;
};

export type RunTemplateOptions = {
  runtime: CursorRuntime;
  /** Required for cloud when `cloudDefaults.repos` is not set in controller config. */
  cloud?: CloudAgentOptions;
  variables?: Record<string, unknown>;
  /** When true, uses `Agent.create` + `stream` + `wait` instead of `Agent.prompt`. */
  stream?: boolean;
  onText?: (chunk: string) => void;
  /** Merged into `AgentOptions` for this run (e.g. `name`, `mcpServers`). */
  agentOptions?: Partial<AgentOptions>;
};

export function resolveApiKey(config?: string): string {
  const key = (config ?? process.env.CURSOR_API_KEY ?? "").trim();
  if (!key)
    throw new Error(
      "CURSOR_API_KEY is missing (pass apiKey in CursorControllerConfig or set env).",
    );
  return key;
}
