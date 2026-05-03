import type { JobTemplate } from "../controller/types.js";
import { customPlannerTemplate } from "../shared/planner/planner-template.js";
import { planningTemplate } from "./planning.js";
import { makeRawPromptTemplate } from "./pr-agent.js";

const prReviewJobTemplate = makeRawPromptTemplate("pr-review");
const prFollowUpJobTemplate = makeRawPromptTemplate("pr-follow-up");
const prTaskJobTemplate = makeRawPromptTemplate("pr-task");

/** Built-in templates + org planner under `src/shared/` (tracked; not under `projects/`). */
export const templatesById: Record<string, JobTemplate> = {
  [planningTemplate.id]: planningTemplate,
  [customPlannerTemplate.id]: customPlannerTemplate,
  [prReviewJobTemplate.id]: prReviewJobTemplate,
  [prFollowUpJobTemplate.id]: prFollowUpJobTemplate,
  [prTaskJobTemplate.id]: prTaskJobTemplate,
};

export function getTemplate(id: string): JobTemplate | undefined {
  if (id === "planning") return planningTemplate;
  if (id === "planner" || id === "shared.planner") return customPlannerTemplate;
  return templatesById[id];
}

export { planningTemplate, customPlannerTemplate };
export { prReviewTemplate, prFollowUpTemplate, prTaskTemplate, makeRawPromptTemplate } from "./pr-agent.js";
