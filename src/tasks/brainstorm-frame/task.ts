import { planningTemplate } from "../../templates/index.js";
import type { TaskDefinition } from "../types.js";

/** Clarify goal, assumptions, and verification using the generic planning template. */
export const brainstormFrameTask: TaskDefinition = {
  id: "brainstorm-frame",
  title: "Frame",
  description: "Structured planning scaffold for the stated goal and constraints.",
  run: async ({ controller, variables, previousSummary }) => {
    const goal = String(variables.goal ?? "").trim();
    const extra = [variables.constraints, variables.scope, previousSummary]
      .filter(Boolean)
      .join("\n\n");
    return controller.runTemplate(planningTemplate, {
      runtime: "local",
      variables: {
        goal,
        context: extra || undefined,
      },
    });
  },
};
