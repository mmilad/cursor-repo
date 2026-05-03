import type { JobTemplate } from "../controller/types.js";

/** Use for task breakdown before implementation; extend the registry with your own templates. */
export const planningTemplate: JobTemplate = {
  id: "planning.v1",
  description: "Structured planning output for a stated goal (no code unless necessary).",
  buildPrompt: (variables) => {
    const goal = String(variables.goal ?? variables.task ?? "").trim();
    const context = variables.context != null ? String(variables.context) : "";
    return [
      "You are planning work in a repository.",
      goal ? `Goal:\n${goal}` : "Goal: (none supplied — ask what to plan for.)",
      context ? `Extra context:\n${context}` : "",
      "",
      "Produce: (1) assumptions, (2) ordered steps, (3) risks, (4) how to verify success.",
      "Be concise. Do not write implementation code unless a tiny snippet clarifies an interface.",
    ]
      .filter(Boolean)
      .join("\n\n");
  },
};
