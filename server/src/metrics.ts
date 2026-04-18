/** @format */

import type { Event, Metrics, ActionType } from "./types.ts";

const ACTIONS: ActionType[] = [
  "read_file",
  "write_file",
  "run_command",
  "llm_call",
];

export function computeMetrics(events: Event[]): Metrics {
  const total = events.length;

  if (total === 0) {
    const empty = Object.fromEntries(ACTIONS.map((a) => [a, 0])) as Record<
      ActionType,
      number
    >;
    return { totalSteps: 0, successRatio: 1, actionDistribution: empty };
  }

  let successCount = 0;
  const actionCounts = Object.fromEntries(ACTIONS.map((a) => [a, 0])) as Record<
    ActionType,
    number
  >;

  for (const e of events) {
    if (e.metadata.status === "success") successCount++;
    actionCounts[e.action]++;
  }

  const actionDistribution = Object.fromEntries(
    ACTIONS.map((a) => [a, actionCounts[a] / total]),
  ) as Record<ActionType, number>;

  return {
    totalSteps: total,
    successRatio: successCount / total,
    actionDistribution,
  };
}
