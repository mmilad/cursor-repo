import type { CursorController } from "../controller/index.js";
import type { BrainstormInput, BrainstormOutput } from "./brainstorm/types.js";
import { runBrainstormWorkflow } from "./brainstorm/workflow.js";

export type WorkflowRegistry = {
  brainstorm: (controller: CursorController, input: BrainstormInput) => Promise<BrainstormOutput>;
};

export const workflows: WorkflowRegistry = {
  brainstorm: runBrainstormWorkflow,
};

export type WorkflowId = keyof WorkflowRegistry;

export function getWorkflow(id: string): WorkflowRegistry[WorkflowId] | undefined {
  if (id in workflows) return workflows[id as WorkflowId];
  return undefined;
}
