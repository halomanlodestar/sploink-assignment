/** @format */

export type AgentAction =
  | "read_file"
  | "write_file"
  | "run_command"
  | "llm_call";

export interface AgentEvent {
  session_id: string;
  timestamp: number;
  step: number;
  action: AgentAction;
  input: string;
  output: string;
  metadata: {
    file?: string | null;
    status: "success" | "failure";
  };
}

export interface Metrics {
  totalSteps: number;
  successRatio: number;
  actionDistribution: Record<string, number>;
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
  signals: string[];
}

export interface DetectionResult {
  loop: LoopResult;
  drift: DriftResult;
  failure: FailureResult;
  status: "healthy" | "looping" | "drifting" | "failing";
  secondary_signals: string[];
}

export interface SessionSummary {
  session_id: string;
  status: "healthy" | "looping" | "drifting" | "failing";
  secondary_signals: string[];
  metrics: Metrics;
  event_count: number;
}

export interface SessionDetail extends SessionSummary {
  events: AgentEvent[];
  detection: DetectionResult;
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function getSessions(): Promise<SessionSummary[]> {
  const res = await fetch(`${BASE}/sessions`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch sessions");
  return res.json();
}

export async function getSession(id: string): Promise<SessionDetail> {
  const res = await fetch(`${BASE}/sessions/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  if (res.status === 404) throw new Error("Session not found");
  if (!res.ok) throw new Error("Failed to fetch session");
  return res.json();
}

export interface PostEventsResult {
  accepted: number;
  dropped: number;
}

export async function postEvents(events: unknown[]): Promise<PostEventsResult> {
  const res = await fetch(`${BASE}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(events),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? "Failed to post events",
    );
  }
  return res.json();
}
