/** @format */

import type { FailureState, FailureResult } from "../types.ts";
import type { Config } from "../config.ts";

export function updateFailureState(
  state: FailureState,
  fp: string,
  success: boolean,
  cfg: Config["failure"],
): void {
  state.eventsSeen += 1;
  const outcome = success ? 1 : 0;

  if (state.eventsSeen <= cfg.coldStartMin) {
    state.firstFiveResults.push(outcome);
    if (state.eventsSeen === cfg.coldStartMin) {
      const sum = state.firstFiveResults.reduce((a, b) => a + b, 0);
      state.ema = sum / cfg.coldStartMin;
    }
  } else {
    state.ema = cfg.emaAlpha * outcome + (1 - cfg.emaAlpha) * state.ema;
  }

  state.streak = success ? 0 : state.streak + 1;

  state.recentWindow.push({ fp, success });
  if (state.recentWindow.length > cfg.retryWindow) {
    state.recentWindow.shift();
  }
}

export function computeFailureResult(
  state: FailureState,
  cfg: Config["failure"],
): FailureResult {
  if (state.eventsSeen < cfg.coldStartMin) {
    return { failing: false, signals: [] };
  }

  const ema_fired = state.ema < cfg.emaThreshold;
  const streak_fired = state.streak >= cfg.streakThreshold;

  const failCounts = new Map<string, number>();
  for (const entry of state.recentWindow) {
    if (!entry.success) {
      failCounts.set(entry.fp, (failCounts.get(entry.fp) ?? 0) + 1);
    }
  }
  const retry_fired = [...failCounts.values()].some(
    (c) => c >= cfg.retryMinFails,
  );

  const signals: string[] = [];
  if (ema_fired) signals.push("ema");
  if (streak_fired) signals.push("streak");
  if (retry_fired) signals.push("retry");

  const failing = retry_fired || (ema_fired && streak_fired);

  return { failing, signals };
}
