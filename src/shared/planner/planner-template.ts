import type { JobTemplate } from "../../controller/types.js";

/**
 * Org-wide planner prompt reused across managed checkouts. Registered in
 * {@link ../../templates/index.js}; edit here only — not under `projects/` (that tree is for clones only).
 */
export const customPlannerTemplate: JobTemplate = {
  id: "shared.planner.v1",
  description:
    "Org planner: goals, constraints, milestones, and verification — tuned for wrapper-driven workflows.",
  buildPrompt: (variables) => {
    const goal = String(variables.goal ?? variables.task ?? "").trim();
    const context = variables.context != null ? String(variables.context) : "";
    const constraints = variables.constraints != null ? String(variables.constraints) : "";
    const repo = variables.repo != null ? String(variables.repo) : "";

    return [
      "You are the central planning agent for a managed project in a wrapper repository.",
      "Optimize for clarity, execution order, and handoff to implementers or cloud agents.",
      "",
      goal ? `## Goal\n${goal}` : "## Goal\n(Ask the user for the goal if missing.)",
      repo ? `## Repository / scope\n${repo}` : "",
      context ? `## Context\n${context}` : "",
      constraints ? `## Constraints\n${constraints}` : "",
      "",
      "## Output",
      "1. **Objective** — one sentence.",
      "2. **Assumptions** — bullet list.",
      "3. **Workstreams** — grouped tasks with dependencies.",
      "4. **Milestones** — ordered checkpoints.",
      "5. **Risks & mitigations**.",
      "6. **Definition of done** — how we verify success.",
      "7. **Next actions** — concrete immediate steps (who/what).",
      "",
      "Be concise. No large code blocks unless essential to disambiguate an API.",
    ]
      .filter(Boolean)
      .join("\n");
  },
};
