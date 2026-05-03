import type { PlanningRunInputs } from "./types.js";

/** Replace `{key}` tokens; `{prior.stepId}` pulls from accumulated outputs. */
export function resolvePlaceholders(
  template: string,
  inputs: PlanningRunInputs,
  priorOutputs: Record<string, string>,
): string {
  const flat: Record<string, string> = {
    goal: inputs.goal ?? "",
    context: inputs.context ?? "",
    constraints: inputs.constraints ?? "",
    repo: inputs.repo ?? "",
  };

  return template.replace(/\{([^}]+)\}/g, (_, raw: string) => {
    const key = String(raw).trim();
    const prior = key.match(/^(?:prior\.)(.+)$/);
    if (prior) return priorOutputs[prior[1]] ?? "";
    return flat[key] ?? "";
  });
}

/** Resolve every string in a variables map. */
export function resolveVariableTemplates(
  variableTemplates: Record<string, string>,
  inputs: PlanningRunInputs,
  priorOutputs: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(variableTemplates)) {
    out[k] = resolvePlaceholders(v, inputs, priorOutputs);
  }
  return out;
}
