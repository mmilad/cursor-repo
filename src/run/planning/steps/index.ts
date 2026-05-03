import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PlanningStepConfig } from "../types.js";

const stepsDir = dirname(fileURLToPath(import.meta.url));

function parseSequence(data: unknown): PlanningStepConfig[] {
  if (!data || typeof data !== "object") throw new Error("planning sequence: root must be an object");
  const root = data as Record<string, unknown>;
  if (root.version !== 1) throw new Error("planning sequence: unsupported version (expected 1)");
  const steps = root.steps;
  if (!Array.isArray(steps)) throw new Error("planning sequence: missing steps array");

  const parsed: PlanningStepConfig[] = [];
  for (const row of steps) {
    if (!row || typeof row !== "object") throw new Error("planning sequence: invalid step row");
    const s = row as Record<string, unknown>;
    const id = String(s.id ?? "").trim();
    const title = String(s.title ?? "").trim();
    const templateId = String(s.templateId ?? "").trim();
    const order = Number(s.order);
    if (!id) throw new Error("planning sequence: step missing id");
    if (!title) throw new Error(`planning sequence: step ${id} missing title`);
    if (!templateId) throw new Error(`planning sequence: step ${id} missing templateId`);
    if (!Number.isFinite(order)) throw new Error(`planning sequence: step ${id} missing numeric order`);

    const variableTemplates = s.variableTemplates;
    if (!variableTemplates || typeof variableTemplates !== "object" || Array.isArray(variableTemplates)) {
      throw new Error(`planning sequence: step ${id} needs object variableTemplates`);
    }
    const vt: Record<string, string> = {};
    for (const [k, v] of Object.entries(variableTemplates as Record<string, unknown>)) {
      vt[k] = String(v ?? "");
    }

    const description = s.description != null ? String(s.description) : undefined;
    const instructionsFile =
      s.instructionsFile != null && String(s.instructionsFile).trim()
        ? String(s.instructionsFile).trim()
        : undefined;

    parsed.push({
      id,
      order,
      title,
      description,
      templateId,
      variableTemplates: vt,
      instructionsFile,
    });
  }

  parsed.sort((a, b) => a.order - b.order);
  const ids = new Set<string>();
  for (const st of parsed) {
    if (ids.has(st.id)) throw new Error(`planning sequence: duplicate step id ${st.id}`);
    ids.add(st.id);
  }
  return parsed;
}

/** Load and validate `sequence.json` next to this module. */
export function loadPlanningSteps(): PlanningStepConfig[] {
  const path = join(stepsDir, "sequence.json");
  const raw = readFileSync(path, "utf8");
  const data: unknown = JSON.parse(raw);
  return parseSequence(data);
}

/** Read optional markdown instruction file from the steps directory. */
export function loadStepInstructions(filename: string): string {
  const path = join(stepsDir, filename);
  return readFileSync(path, "utf8");
}
