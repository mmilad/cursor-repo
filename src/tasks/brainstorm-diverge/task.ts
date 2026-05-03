import type { TaskDefinition } from "../types.js";

/** Generate many distinct ideas without judging them yet. */
export const brainstormDivergeTask: TaskDefinition = {
  id: "brainstorm-diverge",
  title: "Diverge",
  description: "Brainstorm a wide set of options informed by the framing step.",
  run: async ({ controller, variables, previousSummary }) => {
    const goal = String(variables.goal ?? "").trim();
    const prompt = [
      "You are in the **diverge** phase of a brainstorm workflow.",
      "Do not rank or reject ideas yet; maximize breadth.",
      "",
      goal ? `## Goal\n${goal}` : "## Goal\n(unspecified)",
      previousSummary ? `## Prior framing (use as input only)\n${previousSummary}` : "",
      "",
      "## Output",
      "Return at least **10** clearly distinct ideas or directions (bullet list).",
      "Each bullet should be one line, concrete enough that a teammate could explore it.",
    ]
      .filter(Boolean)
      .join("\n\n");

    return controller.askLocal(prompt);
  },
};
