/**
 * Persistent JSON state — prevents duplicate agent runs across daemon restarts.
 * Stored at $STATE_FILE (default: .agent-state.json in process.cwd()).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export type PRStatus =
  | "pending"
  | "reviewing"
  | "reviewed"
  | "follow_up"
  | "merging"
  | "merged"
  | "skipped";

export type TaskStatus = "pending" | "implementing" | "done" | "error";

export type PRRecord = {
  repoSlug: string;
  prNumber: number;
  status: PRStatus;
  lastRunId?: string;
  reviewPostedAt?: string;
  followUpCount: number;
  lastUpdatedAt: string;
  headSha: string;
  /** Accumulated review/follow-up notes stored between steps. */
  agentNotes?: string;
};

export type TaskRecord = {
  repoSlug: string;
  issueNumber: number;
  status: TaskStatus;
  lastRunId?: string;
  startedAt: string;
  doneAt?: string;
};

export type AgentState = {
  version: 1;
  prs: Record<string, PRRecord>;
  tasks: Record<string, TaskRecord>;
};

function defaultState(): AgentState {
  return { version: 1, prs: {}, tasks: {} };
}

export class StateStore {
  private path: string;
  private state: AgentState;

  constructor(stateFilePath?: string) {
    this.path = stateFilePath ?? join(process.cwd(), ".agent-state.json");
    this.state = this.load();
  }

  private load(): AgentState {
    if (!existsSync(this.path)) return defaultState();
    try {
      const raw = readFileSync(this.path, "utf8");
      const parsed = JSON.parse(raw) as AgentState;
      if (parsed.version !== 1) return defaultState();
      return parsed;
    } catch {
      return defaultState();
    }
  }

  private save(): void {
    writeFileSync(this.path, JSON.stringify(this.state, null, 2), "utf8");
  }

  private prKey(repoSlug: string, prNumber: number): string {
    return `${repoSlug}#${prNumber}`;
  }

  private taskKey(repoSlug: string, issueNumber: number): string {
    return `${repoSlug}#issue-${issueNumber}`;
  }

  getPR(repoSlug: string, prNumber: number): PRRecord | undefined {
    return this.state.prs[this.prKey(repoSlug, prNumber)];
  }

  upsertPR(record: Omit<PRRecord, "followUpCount" | "lastUpdatedAt"> & { followUpCount?: number; lastUpdatedAt?: string }): PRRecord {
    const key = this.prKey(record.repoSlug, record.prNumber);
    const existing = this.state.prs[key];
    const updated: PRRecord = {
      ...existing,
      ...record,
      followUpCount: record.followUpCount ?? existing?.followUpCount ?? 0,
      lastUpdatedAt: new Date().toISOString(),
    };
    this.state.prs[key] = updated;
    this.save();
    return updated;
  }

  /** Reset a PR record when the head SHA changes (new commits pushed). */
  resetPRIfShaChanged(repoSlug: string, prNumber: number, currentSha: string): boolean {
    const key = this.prKey(repoSlug, prNumber);
    const existing = this.state.prs[key];
    if (existing && existing.headSha !== currentSha) {
      this.state.prs[key] = {
        ...existing,
        status: "pending",
        headSha: currentSha,
        followUpCount: 0,
        agentNotes: undefined,
        lastUpdatedAt: new Date().toISOString(),
      };
      this.save();
      return true;
    }
    return false;
  }

  getTask(repoSlug: string, issueNumber: number): TaskRecord | undefined {
    return this.state.tasks[this.taskKey(repoSlug, issueNumber)];
  }

  upsertTask(record: TaskRecord): TaskRecord {
    const key = this.taskKey(record.repoSlug, record.issueNumber);
    this.state.tasks[key] = { ...record };
    this.save();
    return record;
  }

  allPRs(): PRRecord[] {
    return Object.values(this.state.prs);
  }

  allTasks(): TaskRecord[] {
    return Object.values(this.state.tasks);
  }

  /** Purge merged/done entries older than `maxAgeDays`. */
  gc(maxAgeDays = 30): void {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    for (const [k, v] of Object.entries(this.state.prs)) {
      if (
        (v.status === "merged" || v.status === "skipped") &&
        new Date(v.lastUpdatedAt).getTime() < cutoff
      ) {
        delete this.state.prs[k];
      }
    }
    for (const [k, v] of Object.entries(this.state.tasks)) {
      if ((v.status === "done" || v.status === "error") && v.doneAt) {
        if (new Date(v.doneAt).getTime() < cutoff) delete this.state.tasks[k];
      }
    }
    this.save();
  }
}
