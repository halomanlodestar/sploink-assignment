/** @format */

import type { Event, SessionState, DetectionResult } from "../types.ts";
import { CONFIG } from "../config.ts";
import { fingerprint } from "./normalize.ts";
import { updateLoopState, computeLoopResult } from "./loop.ts";
import { updateFailureState, computeFailureResult } from "./failure.ts";
import { computeDriftResult } from "./drift.ts";

function deriveStatus(
  result: Omit<DetectionResult, "status" | "secondary_signals">,
): {
  status: DetectionResult["status"];
  secondary_signals: string[];
} {
  const signals: Array<{ key: string; active: boolean }> = [
    { key: "failing", active: result.failure.failing },
    { key: "looping", active: result.loop.looping },
    { key: "drifting", active: result.drift.drifting },
  ];

  const active = signals.filter((s) => s.active).map((s) => s.key);

  if (active.length === 0) {
    return { status: "healthy", secondary_signals: [] };
  }

  // Priority: failing > looping > drifting
  const priority = ["failing", "looping", "drifting"];
  const status = priority.find((p) =>
    active.includes(p),
  ) as DetectionResult["status"];
  const secondary_signals = active.filter((s) => s !== status);

  return { status, secondary_signals };
}

function emitResult(session: SessionState): void {
  const loop = computeLoopResult(session.detectionState.loop, CONFIG.loop);
  const failure = computeFailureResult(
    session.detectionState.failure,
    CONFIG.failure,
  );
  const drift = computeDriftResult(session.events, CONFIG.drift);

  const partial = { loop, failure, drift };
  const { status, secondary_signals } = deriveStatus(partial);

  session.cachedResult = { ...partial, status, secondary_signals };
}

export class DetectionEngine {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private lastEmit = new Map<string, number>();

  onEvent(session: SessionState, event: Event): void {
    const fp = fingerprint(event.action, event.input);
    const success = event.metadata.status === "success";

    updateLoopState(session.detectionState.loop, fp, CONFIG.loop);
    updateFailureState(
      session.detectionState.failure,
      fp,
      success,
      CONFIG.failure,
    );
    session.detectionState.driftEventCount += 1;

    const id = session.session_id;
    const now = Date.now();
    const last = this.lastEmit.get(id) ?? 0;

    if (now - last >= CONFIG.detection.maxWaitMs) {
      const existing = this.timers.get(id);
      if (existing) clearTimeout(existing);
      this.timers.delete(id);
      this.lastEmit.set(id, now);
      emitResult(session);
      return;
    }

    const existing = this.timers.get(id);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.timers.delete(id);
      this.lastEmit.set(id, Date.now());
      emitResult(session);
    }, CONFIG.detection.debounceMs);

    this.timers.set(id, timer);
  }
}
