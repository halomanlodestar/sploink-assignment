/** @format */

import type { SessionStore } from "../store.ts";
import type { DetectionResult } from "../types.ts";
import { computeMetrics } from "../metrics.ts";

const EMPTY_RESULT: DetectionResult = {
  loop: { looping: false, score: 0 },
  drift: { drifting: false, driftStep: null, similarity: 1 },
  failure: { failing: false, signals: [] },
  status: "healthy",
  secondary_signals: [],
};

export function handleGetSessions(store: SessionStore): Response {
  const sessions = store.getAll().map((s) => {
    const result = s.cachedResult ?? EMPTY_RESULT;
    const metrics = computeMetrics(s.events);
    return {
      session_id: s.session_id,
      status: result.status,
      secondary_signals: result.secondary_signals,
      metrics,
      event_count: s.events.length,
    };
  });

  return Response.json(sessions);
}

export function handleGetSession(
  session_id: string,
  store: SessionStore,
): Response {
  const s = store.get(session_id);
  if (!s) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const result = s.cachedResult ?? EMPTY_RESULT;
  const metrics = computeMetrics(s.events);

  return Response.json({
    session_id: s.session_id,
    status: result.status,
    secondary_signals: result.secondary_signals,
    metrics,
    events: s.events,
    detection: result,
  });
}
