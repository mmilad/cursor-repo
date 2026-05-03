import { Agent, type AgentOptions, type RunResult, CursorAgentError } from "@cursor/sdk";

/**
 * Create an agent, send one message, optionally consume the assistant text stream,
 * then `wait()` and dispose. Use when you need live tokens; otherwise prefer `Agent.prompt`.
 */
export async function runPromptWithOptionalStream(
  agentOptions: AgentOptions,
  message: string,
  onText?: (chunk: string) => void,
): Promise<RunResult> {
  const agent = await Agent.create(agentOptions);
  try {
    const run = await agent.send(message);
    if (run.supports("stream")) {
      for await (const event of run.stream()) {
        if (event.type === "assistant" && onText) {
          for (const block of event.message.content) {
            if (block.type === "text") onText(block.text);
          }
        }
      }
    }
    return await run.wait();
  } catch (err) {
    if (err instanceof CursorAgentError) throw err;
    throw err;
  } finally {
    await agent[Symbol.asyncDispose]();
  }
}
