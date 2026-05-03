import type { RunResult } from "@cursor/sdk";
import type { CursorController } from "../controller/index.js";

/** Per-task execution context: shared controller plus variables and optional prior step text. */
export type TaskContext = {
  controller: CursorController;
  variables: Record<string, unknown>;
  /** Assistant-style summary from the previous workflow step (for prompt chaining). */
  previousSummary?: string;
};

/** Atomic unit: metadata + async runner against the controller. */
export type TaskDefinition = {
  id: string;
  title: string;
  description?: string;
  run: (ctx: TaskContext) => Promise<RunResult>;
};

/** Data-driven step list (optional manifests); `task` holds the resolved runner. */
export type WorkflowStep = {
  taskId: string;
  task: TaskDefinition;
};

/** Best-effort text to pass to the next task as `previousSummary`. */
export function summaryFromRunResult(result: RunResult): string | undefined {
  const t = result.result?.trim();
  return t || undefined;
}
