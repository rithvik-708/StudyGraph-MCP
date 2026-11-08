import type { EvalEnv } from "./harness.js";

export type Category =
  | "tool-selection"
  | "retrieval-accuracy"
  | "invalid-input"
  | "missing-data"
  | "authorization"
  | "incorrect-assumptions"
  | "multi-step-workflow";

export interface Scenario {
  id: string;
  category: Category;
  description: string;
  /** Requires a live ANTHROPIC_API_KEY (drives a real Claude tool-use turn). Skipped, not failed, when absent. */
  requiresLlm?: boolean;
  run: (env: EvalEnv) => Promise<void>;
}

export class EvalAssertionError extends Error {}

export function assertEval(condition: boolean, message: string): asserts condition {
  if (!condition) throw new EvalAssertionError(message);
}
