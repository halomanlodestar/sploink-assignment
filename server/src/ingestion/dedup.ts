/** @format */

import type { Event } from "../types.ts";

export function dedupKey(
  session_id: string,
  timestamp: number,
  step: number,
  action: string,
  input: string,
): string {
  const raw = `${session_id}|${timestamp}|${step}|${action}|${input}`;
  return String(Bun.hash(raw));
}

export function eventDedupKey(event: Event): string {
  return dedupKey(
    event.session_id,
    event.timestamp,
    event.step,
    event.action,
    event.input,
  );
}
