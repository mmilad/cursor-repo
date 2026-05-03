import type {
  AgentOptions,
  CloudAgentOptions,
  LocalAgentOptions,
  ModelSelection,
} from "@cursor/sdk";

export type LocalAgentContext = {
  apiKey: string;
  model: ModelSelection;
  localCwd: string;
  localExtra?: Omit<LocalAgentOptions, "cwd">;
};

/** Merge controller defaults with per-call overrides for a local `Agent.prompt` / `Agent.create`. */
export function buildLocalAgentOptions(
  ctx: LocalAgentContext,
  overrides?: Partial<AgentOptions>,
): AgentOptions {
  const { local: loc, model: m, apiKey: _a, cloud: _c, ...rest } = overrides ?? {};
  return {
    ...rest,
    apiKey: ctx.apiKey,
    model: m ?? ctx.model,
    local: {
      cwd: ctx.localCwd,
      ...ctx.localExtra,
      ...loc,
    },
  };
}

/** Shallow-merge cloud options (per-call wins over controller defaults). */
export function mergeCloudOptions(
  defaults: CloudAgentOptions | undefined,
  override: CloudAgentOptions | undefined,
): CloudAgentOptions {
  return { ...defaults, ...override };
}

export function assertCloudHasRepos(cloud: CloudAgentOptions, message: string): void {
  if (!cloud.repos?.length) throw new Error(message);
}
