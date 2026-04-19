/** @format */

export type ActionType =
  | "read_file"
  | "write_file"
  | "run_command"
  | "llm_call";

export interface Event {
  session_id: string;
  timestamp: number;
  step: number;
  action: ActionType;
  input: string;
  output: string;
  metadata: {
    file: string | null;
    status: "success" | "failure";
  };
}

export interface LoopState {
  /**
   * ring buffer of fingerprints, max W=30
   */
  buffer: string[];
  bufferFill: number;
  head: number;
}

export interface FailureState {
  ema: number;
  eventsSeen: number;
  firstFiveResults: number[];
  streak: number;
  recentWindow: Array<{ fp: string; success: boolean }>;
}

export interface DetectionState {
  loop: LoopState;
  failure: FailureState;
  /*
   * drift has no incremental state — it reads the event list directly
   * only tracks event count for the cold-start guard
   */
  driftEventCount: number;
}

export interface LoopResult {
  looping: boolean;
  score: number;
}

export interface DriftResult {
  drifting: boolean;
  driftStep: number | null;
  similarity: number;
}

export interface FailureResult {
  failing: boolean;
  signals: string[]; // which signals fired: "ema", "streak", "retry"
}

export interface DetectionResult {
  loop: LoopResult;
  drift: DriftResult;
  failure: FailureResult;
  status: "healthy" | "looping" | "drifting" | "failing";
  secondary_signals: string[];
}

export interface SessionState {
  session_id: string;
  events: Event[]; // sorted by step, then timestamp
  dedupSet: Set<string>;
  detectionState: DetectionState;
  cachedResult: DetectionResult | null;
}

export interface Metrics {
  totalSteps: number;
  successRatio: number;
  actionDistribution: Record<ActionType, number>;
}
