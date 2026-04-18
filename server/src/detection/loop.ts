/** @format */

import type { LoopState, LoopResult } from "../types.ts";
import type { Config } from "../config.ts";

export function updateLoopState(
  state: LoopState,
  fp: string,
  cfg: Config["loop"],
): void {
  const W = cfg.bufferSize;

  if (state.buffer.length < W) {
    state.buffer.push(fp);
  } else {
    state.buffer[state.head] = fp;
  }

  state.head = (state.head + 1) % W;
  state.bufferFill = Math.min(state.bufferFill + 1, W);
}

function getBufferContents(state: LoopState): string[] {
  const { buffer, bufferFill, head } = state;
  if (bufferFill < buffer.length) {
    return buffer.slice(0, bufferFill);
  }
  // buffer is full — read in order starting from head (oldest)
  return [...buffer.slice(head), ...buffer.slice(0, head)];
}

function buildNgrams(items: string[], n: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i <= items.length - n; i++) {
    const key = items.slice(i, i + n).join("\x00");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function computeLoopResult(
  state: LoopState,
  cfg: Config["loop"],
): LoopResult {
  if (state.bufferFill < cfg.minFill) {
    return { looping: false, score: 0 };
  }

  const contents = getBufferContents(state);
  const fill = contents.length;
  let maxScore = 0;

  for (const n of cfg.ngramSizes) {
    const counts = buildNgrams(contents, n);
    for (const count of counts.values()) {
      const score = (count * n) / fill;
      if (score > maxScore) maxScore = score;
    }
  }

  return { looping: maxScore > cfg.scoreThreshold, score: maxScore };
}
