import { Agent, type AgentOptions, type SDKAgent } from "@cursor/sdk";

/**
 * `Agent.create` with guaranteed `Symbol.asyncDispose` in a `finally` block.
 * Use for multi-turn flows (`send` multiple times on the same conversation).
 */
export async function withAgentSession<T>(
  apiKey: string,
  options: AgentOptions,
  fn: (agent: SDKAgent) => Promise<T>,
): Promise<T> {
  const agent = await Agent.create({ apiKey, ...options });
  try {
    return await fn(agent);
  } finally {
    await agent[Symbol.asyncDispose]();
  }
}
