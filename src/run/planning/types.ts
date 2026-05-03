import type { RunResult } from "@cursor/sdk";
import type { RunTemplateOptions } from "../../controller/types.js";

/** Inputs every planning run accepts; map into step `variableTemplates` via `{goal}` etc. */
export type PlanningRunInputs = {
  goal: string;
  context?: string;
  constraints?: string;
  repo?: string;
};

/** One row in `steps/sequence.json` — declarative wiring for templates + files. */
export type PlanningStepConfig = {
  id: string;
  order: number;
  title: string;
  /** Short summary for logs / UI. */
  description?: string;
  /** Registered template id (see `getTemplate` in `src/templates/index.ts`). */
  templateId: string;
  /**
   * Keys passed to `JobTemplate.buildPrompt`. Values may contain placeholders:
   * `{goal}`, `{context}`, `{constraints}`, `{repo}`, `{prior.<stepId>}` (assistant text from that step).
   */
  variableTemplates: Record<string, string>;
  /** Optional markdown under `steps/` appended after the template body for this step. */
  instructionsFile?: string;
};

export type PlanningSequenceFile = {
  version: number;
  steps: PlanningStepConfig[];
};

export type PlanningRunnerOptions = PlanningRunInputs & {
  /** Defaults to `process.cwd()` when omitted (matches CLI). */
  localCwd?: string;
  /** Isolated one-shot per step vs one agent and multiple sends. */
  execution?: "sequential" | "session";
} & Pick<RunTemplateOptions, "runtime" | "cloud" | "stream" | "onText" | "agentOptions">;

export type PlanningStepResult = {
  stepId: string;
  title: string;
  templateId: string;
  result: RunResult;
};

export type PlanningRunResult = {
  steps: PlanningStepResult[];
  /** Prior step outputs keyed by step id (assistant `result` when present). */
  outputs: Record<string, string>;
};
