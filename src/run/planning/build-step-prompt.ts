import type { JobTemplate } from "../../controller/types.js";
import type { PlanningRunInputs, PlanningStepConfig } from "./types.js";
import { resolveVariableTemplates } from "./resolve-placeholders.js";

export function buildStepPrompt(
  step: PlanningStepConfig,
  template: JobTemplate,
  inputs: PlanningRunInputs,
  priorOutputs: Record<string, string>,
  instructionsSuffix: string | undefined,
): string {
  const variables = resolveVariableTemplates(step.variableTemplates, inputs, priorOutputs);
  const body = template.buildPrompt(variables);
  if (!instructionsSuffix?.trim()) return body;
  return `${body}\n\n---\n\n## Step instructions: ${step.title}\n\n${instructionsSuffix.trim()}\n`;
}
