import type { SDKAgent } from "@cursor/sdk";
import { CursorController } from "../../controller/controller.js";
import type { JobTemplate, RunTemplateOptions } from "../../controller/types.js";
import { getTemplate } from "../../templates/index.js";
import { buildStepPrompt } from "./build-step-prompt.js";
import { loadPlanningSteps, loadStepInstructions } from "./steps/index.js";
import type {
  PlanningRunInputs,
  PlanningRunResult,
  PlanningRunnerOptions,
  PlanningStepConfig,
  PlanningStepResult,
} from "./types.js";

function ephemeralTemplate(id: string, body: string): JobTemplate {
  return {
    id: `planning.runner.${id}`,
    description: "Ephemeral prompt assembled by planning runner",
    buildPrompt: () => body,
  };
}

function pickInputs(options: PlanningRunnerOptions): PlanningRunInputs {
  const { goal, context, constraints, repo } = options;
  return { goal, context, constraints, repo };
}

function pickRunTemplateOptions(options: PlanningRunnerOptions): Pick<
  RunTemplateOptions,
  "runtime" | "cloud" | "stream" | "onText" | "agentOptions"
> {
  const { runtime, cloud, stream, onText, agentOptions } = options;
  return { runtime, cloud, stream, onText, agentOptions };
}

async function runOneStep(
  controller: CursorController,
  step: PlanningStepConfig,
  prompt: string,
  runBits: Pick<RunTemplateOptions, "runtime" | "cloud" | "stream" | "onText" | "agentOptions">,
): Promise<PlanningStepResult> {
  const result = await controller.runTemplate(ephemeralTemplate(step.id, prompt), {
    ...runBits,
    variables: {},
    runtime: runBits.runtime ?? "local",
  });

  return {
    stepId: step.id,
    title: step.title,
    templateId: step.templateId,
    result,
  };
}

/**
 * Multi-step planning pipeline driven by `steps/sequence.json` and optional `steps/*.md`.
 * Each step resolves `variableTemplates` (see `resolve-placeholders.ts`) then runs a template + instructions.
 */
export async function runPlanningWithController(
  controller: CursorController,
  options: PlanningRunnerOptions,
): Promise<PlanningRunResult> {
  const inputs = pickInputs(options);
  if (!inputs.goal.trim()) throw new Error("runPlanning: goal is required");

  const runBits = pickRunTemplateOptions(options);
  const execution = options.execution ?? "sequential";
  const ordered = loadPlanningSteps();

  const outputs: Record<string, string> = {};
  const steps: PlanningStepResult[] = [];

  if (execution === "session") {
    const runSession = async (agent: SDKAgent) => {
      for (const step of ordered) {
        const base = getTemplate(step.templateId);
        if (!base) throw new Error(`Unknown templateId "${step.templateId}" for step "${step.id}"`);
        const md =
          step.instructionsFile !== undefined
            ? loadStepInstructions(step.instructionsFile)
            : undefined;
        const prompt = buildStepPrompt(step, base, inputs, outputs, md);
        const run = await agent.send(prompt);
        const result = await run.wait();
        outputs[step.id] = result.result ?? "";
        steps.push({
          stepId: step.id,
          title: step.title,
          templateId: step.templateId,
          result,
        });
        if (result.status === "error" || result.status === "cancelled") break;
      }
    };

    const runtime = runBits.runtime ?? "local";
    if (runtime === "cloud") {
      await controller.withCloudSession(
        async (agent) => {
          await runSession(agent);
        },
        runBits.cloud,
        options.agentOptions,
      );
    } else {
      await controller.withLocalSession(async (agent) => {
        await runSession(agent);
      }, options.agentOptions);
    }
    return { steps, outputs };
  }

  for (const step of ordered) {
    const base = getTemplate(step.templateId);
    if (!base) throw new Error(`Unknown templateId "${step.templateId}" for step "${step.id}"`);
    const md =
      step.instructionsFile !== undefined ? loadStepInstructions(step.instructionsFile) : undefined;
    const prompt = buildStepPrompt(step, base, inputs, outputs, md);
    const row = await runOneStep(controller, step, prompt, runBits);
    steps.push(row);
    outputs[step.id] = row.result.result ?? "";
    if (row.result.status === "error" || row.result.status === "cancelled") break;
  }

  return { steps, outputs };
}

/** Construct a {@link CursorController} with `localCwd` (default `process.cwd()`) then run the pipeline. */
export async function runPlanning(options: PlanningRunnerOptions): Promise<PlanningRunResult> {
  const localCwd = options.localCwd ?? process.cwd();
  const controller = new CursorController({
    localCwd,
    local: { settingSources: [] },
  });
  return runPlanningWithController(controller, options);
}

export type {
  PlanningRunInputs,
  PlanningRunResult,
  PlanningRunnerOptions,
  PlanningSequenceFile,
  PlanningStepConfig,
  PlanningStepResult,
} from "./types.js";

export { loadPlanningSteps, loadStepInstructions } from "./steps/index.js";
export { resolvePlaceholders, resolveVariableTemplates } from "./resolve-placeholders.js";
export { buildStepPrompt } from "./build-step-prompt.js";
