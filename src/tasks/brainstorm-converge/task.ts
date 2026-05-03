import { customPlannerTemplate } from "../../shared/planner/planner-template.js";
import type { TaskDefinition } from "../types.js";

/** Cluster and prioritize: hand off to the org planner with full context. */
export const brainstormConvergeTask: TaskDefinition = {
  id: "brainstorm-converge",
  title: "Converge",
  description: "Synthesize framing + ideas into workstreams, milestones, and next actions.",
  run: async ({ controller, variables, previousSummary }) => {
    const goal = String(variables.goal ?? "").trim();
    const context = [
      variables.constraints != null ? `Constraints:\n${String(variables.constraints)}` : "",
      variables.scope != null ? `Scope:\n${String(variables.scope)}` : "",
      previousSummary ? `## Prior workflow output\n${previousSummary}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    return controller.runTemplate(customPlannerTemplate, {
      runtime: "local",
      variables: {
        goal: goal || "Synthesize the brainstorm below into an execution plan.",
        context: context || undefined,
        constraints: variables.constraints != null ? String(variables.constraints) : undefined,
        repo: variables.scope != null ? String(variables.scope) : undefined,
      },
    });
  },
};
