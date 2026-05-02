import type { JobTemplate } from "../cursor/types.js";
import { customPlannerTemplate } from "../shared/planner/planner-template.js";
import { planningTemplate } from "./planning.js";

/** Built-in templates + org planner under `src/shared/` (tracked; not under `projects/`). */
export const templatesById: Record<string, JobTemplate> = {
  [planningTemplate.id]: planningTemplate,
  [customPlannerTemplate.id]: customPlannerTemplate,
};

export function getTemplate(id: string): JobTemplate | undefined {
  if (id === "planning") return planningTemplate;
  if (id === "planner" || id === "shared.planner") return customPlannerTemplate;
  return templatesById[id];
}

export { planningTemplate, customPlannerTemplate };
