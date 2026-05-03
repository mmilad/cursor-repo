import {
  Agent,
  type GetRunOptions,
  type ListAgentsOptions,
  type ListResult,
  type ListRunsOptions,
  type Run,
  type SDKAgentInfo,
} from "@cursor/sdk";

/** Injects `apiKey` for `Agent.list` (SDK types omit it on the local branch). */
function withListApiKey(apiKey: string, o: ListAgentsOptions): ListAgentsOptions {
  return { ...o, apiKey } as ListAgentsOptions;
}

/**
 * List agents in the local store or on the authenticated cloud account.
 * When `options` is omitted or has no `runtime`, defaults to **local** with `localCwd`.
 */
export function listAgents(
  apiKey: string,
  localCwd: string,
  options?: ListAgentsOptions,
): Promise<ListResult<SDKAgentInfo>> {
  if (!options || options.runtime === undefined) {
    return Agent.list(
      withListApiKey(apiKey, {
        limit: options?.limit,
        cursor: options?.cursor,
        runtime: "local",
        cwd: localCwd,
      }),
    );
  }
  if (options.runtime === "local") {
    return Agent.list(
      withListApiKey(apiKey, {
        ...options,
        cwd: options.cwd ?? localCwd,
      }),
    );
  }
  return Agent.list(withListApiKey(apiKey, { ...options }));
}

/** List runs for an agent (local needs `cwd`; cloud passes `apiKey`). */
export function listRuns(
  apiKey: string,
  localCwd: string,
  agentId: string,
  options?: ListRunsOptions,
): Promise<ListResult<Run>> {
  if (options?.runtime === "cloud") {
    return Agent.listRuns(agentId, { ...options, apiKey });
  }
  const cwd =
    options && options.runtime === "local" && "cwd" in options && options.cwd
      ? options.cwd
      : localCwd;
  return Agent.listRuns(agentId, {
    ...options,
    runtime: "local",
    cwd: cwd ?? localCwd,
  });
}

/** Resolve a `Run` handle by id (cloud options must include `agentId` per SDK). */
export function getRun(
  apiKey: string,
  localCwd: string,
  runId: string,
  options?: GetRunOptions,
): Promise<Run> {
  if (options && "runtime" in options && options.runtime === "cloud") {
    return Agent.getRun(runId, { ...options, apiKey });
  }
  const cwd =
    options && "runtime" in options && options.runtime === "local" && "cwd" in options
      ? options.cwd
      : localCwd;
  return Agent.getRun(runId, { runtime: "local", cwd: cwd ?? localCwd });
}
