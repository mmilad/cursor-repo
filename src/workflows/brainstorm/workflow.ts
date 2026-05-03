import type { RunResult } from "@cursor/sdk";
import type { CursorController } from "../../controller/index.js";
import { brainstormConvergeTask } from "../../tasks/brainstorm-converge/task.js";
import { brainstormDivergeTask } from "../../tasks/brainstorm-diverge/task.js";
import { brainstormFrameTask } from "../../tasks/brainstorm-frame/task.js";
import { summaryFromRunResult, type TaskContext } from "../../tasks/types.js";
import type { BrainstormInput, BrainstormOutput } from "./types.js";

function assertFinished(result: RunResult, taskId: string): void {
  if (result.status === "error") {
    throw new Error(`Workflow stopped: task "${taskId}" ended with status error (run ${result.id})`);
  }
}

/**
 * Linear brainstorm: frame with planning template → diverge (wide ideas) → converge (org planner).
 */
export async function runBrainstormWorkflow(
  controller: CursorController,
  input: BrainstormInput,
): Promise<BrainstormOutput> {
  const variables: Record<string, unknown> = {
    goal: input.goal,
    constraints: input.constraints,
    scope: input.scope,
  };

  const base: Pick<TaskContext, "controller" | "variables"> = { controller, variables };

  const framing = await brainstormFrameTask.run({ ...base });
  assertFinished(framing, brainstormFrameTask.id);

  const framingText = summaryFromRunResult(framing);
  const diverge = await brainstormDivergeTask.run({
    ...base,
    previousSummary: framingText,
  });
  assertFinished(diverge, brainstormDivergeTask.id);

  const divergeText = summaryFromRunResult(diverge);
  const combined =
    [framingText && `## Framing\n${framingText}`, divergeText && `## Divergent ideas\n${divergeText}`]
      .filter(Boolean)
      .join("\n\n") || undefined;

  const converge = await brainstormConvergeTask.run({
    ...base,
    previousSummary: combined,
  });
  assertFinished(converge, brainstormConvergeTask.id);

  return { framing, diverge, converge };
}
