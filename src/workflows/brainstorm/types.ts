import type { RunResult } from "@cursor/sdk";

export type BrainstormInput = {
  goal: string;
  constraints?: string;
  scope?: string;
};

export type BrainstormOutput = {
  framing: RunResult;
  diverge: RunResult;
  converge: RunResult;
};
