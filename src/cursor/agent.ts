/**
 * Cursor SDK wrapper.
 *
 * Encapsulates agent creation, run submission, and result streaming so that
 * the loop orchestrator only deals with high-level operations.
 */

import { Agent } from "@cursor/sdk";
import type { Config } from "../config.js";
import { log } from "../utils/logger.js";

export interface AgentRunResult {
  agentId: string;
  runId: string;
  status: "finished" | "error" | "cancelled";
  output: string;
  prUrl?: string;
  branch?: string;
}

export class CursorAgentRunner {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Launch a cloud agent against a specific repo branch and wait for
   * the result, streaming progress to the logger.
   */
  async runCloudAgent(opts: {
    repoUrl: string;
    startingRef: string;
    prompt: string;
    autoCreatePR?: boolean;
    envVars?: Record<string, string>;
  }): Promise<AgentRunResult> {
    const { repoUrl, startingRef, prompt, autoCreatePR = false, envVars } = opts;

    log.info(
      `Starting cloud agent: repo=${repoUrl} ref=${startingRef} autoCreatePR=${autoCreatePR}`
    );

    await using agent = await Agent.create({
      apiKey: this.config.cursorApiKey,
      model: { id: this.config.cursorModel },
      cloud: {
        repos: [{ url: repoUrl, startingRef }],
        autoCreatePR,
        ...(envVars ? { envVars } : {}),
      },
    });

    const run = await agent.send(prompt);
    const agentId = agent.agentId;
    const runId = run.id;

    log.debug(`Agent ${agentId} / run ${runId} started`);

    let outputBuffer = "";

    try {
      for await (const event of run.stream()) {
        switch (event.type) {
          case "assistant":
            for (const block of event.message.content) {
              if (block.type === "text") {
                outputBuffer += block.text;
                process.stdout.write(".");
              }
            }
            break;
          case "thinking":
            // silently discard thinking tokens
            break;
          case "tool_call":
            if (event.status === "completed") {
              log.debug(`  [tool] ${event.name} completed`);
            }
            break;
          case "status":
            log.debug(`  [status] ${event.status}`);
            break;
          case "task":
            if (event.text) log.info(`  [task] ${event.text}`);
            break;
        }
      }
    } catch (err) {
      log.warn(`Stream interrupted: ${String(err)}`);
    }

    process.stdout.write("\n");

    const result = await run.wait();
    const finalOutput = result.result ?? outputBuffer;
    const gitBranch = result.git?.branches?.[0];
    const prUrl: string | undefined = gitBranch?.prUrl ?? undefined;
    const branch: string | undefined = gitBranch?.branch ?? undefined;

    log.info(`Agent finished: status=${result.status} agentId=${agentId}`);

    return {
      agentId,
      runId,
      status: result.status,
      output: finalOutput,
      prUrl,
      branch,
    };
  }

  /**
   * Resume an existing agent and send a follow-up prompt.
   */
  async continueAgent(opts: {
    agentId: string;
    prompt: string;
  }): Promise<AgentRunResult> {
    const { agentId, prompt } = opts;

    log.info(`Resuming agent ${agentId}`);

    await using agent = await Agent.resume(agentId, {
      apiKey: this.config.cursorApiKey,
    });

    const run = await agent.send(prompt);
    const runId = run.id;

    let outputBuffer = "";

    try {
      for await (const event of run.stream()) {
        if (event.type === "assistant") {
          for (const block of event.message.content) {
            if (block.type === "text") {
              outputBuffer += block.text;
              process.stdout.write(".");
            }
          }
        }
      }
    } catch (err) {
      log.warn(`Stream interrupted: ${String(err)}`);
    }

    process.stdout.write("\n");

    const result = await run.wait();
    const gitBranch2 = result.git?.branches?.[0];

    return {
      agentId,
      runId,
      status: result.status,
      output: result.result ?? outputBuffer,
      prUrl: gitBranch2?.prUrl ?? undefined,
      branch: gitBranch2?.branch ?? undefined,
    };
  }
}
