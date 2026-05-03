/**
 * Persistent state management.
 *
 * Tracks which PRs have been reviewed, merged, or handed off to a follow-up
 * agent, so the loop does not repeat work across restarts.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { log } from "./logger.js";

const PRStateSchema = z.object({
  prUrl: z.string(),
  repoFullName: z.string(),
  prNumber: z.number(),
  status: z.enum([
    "pending",       // Seen, not yet processed
    "reviewing",     // Agent currently reviewing
    "reviewed",      // Review posted, waiting for author response / re-review
    "follow_up",     // Follow-up agent running (refactor, refinement, etc.)
    "merging",       // Auto-merge in progress
    "merged",        // Done
    "skipped",       // Manually skipped / excluded
    "error",         // Processing failed
  ]),
  agentId: z.string().optional(),
  runId: z.string().optional(),
  reviewComment: z.string().optional(),
  followUpTasks: z.array(z.string()).default([]),
  lastUpdated: z.string(),
  errorMessage: z.string().optional(),
});

const TaskStateSchema = z.object({
  issueUrl: z.string(),
  issueNumber: z.number(),
  repoFullName: z.string(),
  title: z.string(),
  body: z.string(),
  status: z.enum(["pending", "running", "done", "error"]),
  agentId: z.string().optional(),
  prUrl: z.string().optional(),
  lastUpdated: z.string(),
  errorMessage: z.string().optional(),
});

const StateSchema = z.object({
  version: z.number().default(1),
  prs: z.record(z.string(), PRStateSchema).default({}),
  tasks: z.record(z.string(), TaskStateSchema).default({}),
});

export type PRState = z.infer<typeof PRStateSchema>;
export type TaskState = z.infer<typeof TaskStateSchema>;
export type State = z.infer<typeof StateSchema>;

export class StateManager {
  private filePath: string;
  private state: State = { version: 1, prs: {}, tasks: {} };
  private dirty = false;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = StateSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        this.state = parsed.data;
        log.debug(`State loaded from ${this.filePath}`);
      } else {
        log.warn("State file corrupt – starting fresh", parsed.error.message);
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        log.warn(`Could not load state: ${String(err)}`);
      }
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (this.dirty) {
        this.persist().catch((e) => log.error("State persist error", e));
      }
    }, 500);
  }

  private async persist(): Promise<void> {
    this.dirty = false;
    await fs.writeFile(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
    log.debug("State persisted");
  }

  async save(): Promise<void> {
    await this.persist();
  }

  // --- PR helpers ---

  getPR(key: string): PRState | undefined {
    return this.state.prs[key];
  }

  setPR(key: string, pr: PRState): void {
    pr.lastUpdated = new Date().toISOString();
    this.state.prs[key] = pr;
    this.dirty = true;
    this.scheduleSave();
  }

  updatePR(key: string, patch: Partial<PRState>): void {
    const existing = this.state.prs[key];
    if (!existing) throw new Error(`PR state not found: ${key}`);
    this.setPR(key, { ...existing, ...patch });
  }

  allPRs(): PRState[] {
    return Object.values(this.state.prs);
  }

  // --- Task helpers ---

  getTask(key: string): TaskState | undefined {
    return this.state.tasks[key];
  }

  setTask(key: string, task: TaskState): void {
    task.lastUpdated = new Date().toISOString();
    this.state.tasks[key] = task;
    this.dirty = true;
    this.scheduleSave();
  }

  updateTask(key: string, patch: Partial<TaskState>): void {
    const existing = this.state.tasks[key];
    if (!existing) throw new Error(`Task state not found: ${key}`);
    this.setTask(key, { ...existing, ...patch });
  }

  allTasks(): TaskState[] {
    return Object.values(this.state.tasks);
  }
}
