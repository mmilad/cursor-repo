/**
 * @module cursor/controller
 *
 * **CursorController** is the façade over `@cursor/sdk` for this repo. It delegates to small
 * modules so each file has one job:
 *
 * | Module | Responsibility |
 * |--------|----------------|
 * | {@link ./constants.js} | Default model id |
 * | {@link ./types.js} | Config + `JobTemplate` shapes, `resolveApiKey` |
 * | {@link ./build-agent-options.js} | Local/cloud option merging for `Agent.*` calls |
 * | {@link ./discovery.js} | `Agent.list`, `Agent.listRuns`, `Agent.getRun` wrappers |
 * | {@link ./run-stream.js} | One-shot send with optional streaming + dispose |
 * | {@link ./session.js} | Multi-turn `Agent.create` + guaranteed dispose |
 *
 * Typical flows:
 * - **Fire-and-forget** — `askLocal` / `askCloud` → `Agent.prompt` (SDK owns lifecycle).
 * - **Template** — `runTemplate` → builds prompt then `Agent.prompt` or {@link ./run-stream.js}.
 * - **Conversation** — `withLocalSession` / `withCloudSession` → {@link ./session.js}.
 * - **Observability** — `listAgents` / `listRuns` / `getRun` → {@link ./discovery.js}.
 */

import "../load-env.js";
import {
  Agent,
  type AgentOptions,
  type CloudAgentOptions,
  type GetRunOptions,
  type ListAgentsOptions,
  type ListResult,
  type ListRunsOptions,
  type ModelSelection,
  type Run,
  type RunResult,
  type SDKAgent,
  type SDKAgentInfo,
} from "@cursor/sdk";

import { DEFAULT_MODEL } from "./constants.js";
import {
  assertCloudHasRepos,
  buildLocalAgentOptions,
  mergeCloudOptions,
  type LocalAgentContext,
} from "./build-agent-options.js";
import { getRun as getRunDiscovery, listAgents as listAgentsDiscovery, listRuns as listRunsDiscovery } from "./discovery.js";
import { runPromptWithOptionalStream } from "./run-stream.js";
import { withAgentSession } from "./session.js";
import type { CursorControllerConfig, JobTemplate, RunTemplateOptions } from "./types.js";
import { resolveApiKey } from "./types.js";

export class CursorController {
  private readonly apiKey: string;
  private readonly model: ModelSelection;
  private readonly localCwd: string;
  private readonly localExtra: CursorControllerConfig["local"];
  private readonly cloudDefaults?: CloudAgentOptions;

  constructor(config: CursorControllerConfig) {
    this.apiKey = resolveApiKey(config.apiKey);
    this.model = config.model ?? DEFAULT_MODEL;
    this.localCwd = config.localCwd;
    this.localExtra = config.local;
    this.cloudDefaults = config.cloudDefaults;
  }

  /** @returns Context passed into {@link buildLocalAgentOptions}. */
  private localCtx(): LocalAgentContext {
    return {
      apiKey: this.apiKey,
      model: this.model,
      localCwd: this.localCwd,
      localExtra: this.localExtra,
    };
  }

  /** Agents visible in the local store or on your cloud account. */
  listAgents(options?: ListAgentsOptions): Promise<ListResult<SDKAgentInfo>> {
    return listAgentsDiscovery(this.apiKey, this.localCwd, options);
  }

  /** Runs recorded for a given agent id. */
  listRuns(agentId: string, options?: ListRunsOptions): Promise<ListResult<Run>> {
    return listRunsDiscovery(this.apiKey, this.localCwd, agentId, options);
  }

  /** Rehydrate a run handle (local uses `localCwd`; cloud requires `agentId` in options per SDK). */
  getRun(runId: string, options?: GetRunOptions): Promise<Run> {
    return getRunDiscovery(this.apiKey, this.localCwd, runId, options);
  }

  /** Single message against `localCwd`; SDK disposes the ephemeral agent. */
  askLocal(message: string, overrides?: Partial<AgentOptions>): Promise<RunResult> {
    return Agent.prompt(message, buildLocalAgentOptions(this.localCtx(), overrides));
  }

  /** Single cloud message; supply `cloud.repos` or set `cloudDefaults` on the controller. */
  askCloud(
    message: string,
    cloud?: CloudAgentOptions,
    overrides?: Partial<AgentOptions>,
  ): Promise<RunResult> {
    const mergedCloud = mergeCloudOptions(this.cloudDefaults, cloud);
    assertCloudHasRepos(
      mergedCloud,
      "Cloud jobs need `repos` on the call or `cloudDefaults.repos` on CursorController.",
    );
    return Agent.prompt(message, {
      apiKey: this.apiKey,
      cloud: mergedCloud,
      ...overrides,
    });
  }

  /**
   * Renders `template` with `variables`, then runs locally or on cloud.
   * Non-streaming path uses `Agent.prompt`; streaming uses {@link runPromptWithOptionalStream}.
   */
  async runTemplate(template: JobTemplate, options: RunTemplateOptions): Promise<RunResult> {
    const message = template.buildPrompt(options.variables ?? {});
    const stream = options.stream ?? false;
    const extra = options.agentOptions ?? {};

    if (options.runtime === "local") {
      const agentOptions = buildLocalAgentOptions(this.localCtx(), extra);
      if (!stream) return Agent.prompt(message, agentOptions);
      return runPromptWithOptionalStream(agentOptions, message, options.onText);
    }

    const mergedCloud = mergeCloudOptions(this.cloudDefaults, options.cloud);
    assertCloudHasRepos(
      mergedCloud,
      "Cloud template runs need `options.cloud.repos` or controller `cloudDefaults.repos`.",
    );
    const agentOptions: AgentOptions = {
      apiKey: this.apiKey,
      cloud: mergedCloud,
      ...extra,
    };
    if (!stream) return Agent.prompt(message, agentOptions);
    return runPromptWithOptionalStream(agentOptions, message, options.onText);
  }

  /** Multi-turn agent with caller-controlled `send` sequence; always disposed. */
  withSession<T>(options: AgentOptions, fn: (agent: SDKAgent) => Promise<T>): Promise<T> {
    return withAgentSession(this.apiKey, options, fn);
  }

  /** `withSession` using local defaults from controller config. */
  withLocalSession<T>(fn: (agent: SDKAgent) => Promise<T>, overrides?: Partial<AgentOptions>): Promise<T> {
    return withAgentSession(this.apiKey, buildLocalAgentOptions(this.localCtx(), overrides), fn);
  }

  /** `withSession` for cloud; supply `repos` or configure `cloudDefaults`. */
  withCloudSession<T>(
    fn: (agent: SDKAgent) => Promise<T>,
    cloud?: CloudAgentOptions,
    overrides?: Partial<AgentOptions>,
  ): Promise<T> {
    const mergedCloud = mergeCloudOptions(this.cloudDefaults, cloud);
    assertCloudHasRepos(
      mergedCloud,
      "Cloud session needs `repos` on the call or `cloudDefaults.repos` on the controller.",
    );
    return withAgentSession(this.apiKey, {
      apiKey: this.apiKey,
      cloud: mergedCloud,
      ...overrides,
    }, fn);
  }
}
