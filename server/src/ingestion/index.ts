/** @format */

import type { RawEvent, Event, ActionType } from "../types.ts";
import { SessionStore } from "../store.ts";
import { CONFIG } from "../config.ts";
import { eventDedupKey } from "./dedup.ts";
import { sortedInsert } from "./reorder.ts";

const VALID_ACTIONS = new Set<string>([
  "read_file",
  "write_file",
  "run_command",
  "llm_call",
]);

function normalize(raw: RawEvent): Event | null {
  const session_id =
    typeof raw.session_id === "string" && raw.session_id.trim()
      ? raw.session_id.trim()
      : null;

  if (!session_id) return null;

  const timestamp =
    typeof raw.timestamp === "number" && isFinite(raw.timestamp)
      ? raw.timestamp
      : Date.now();

  const step =
    typeof raw.step === "number" && isFinite(raw.step)
      ? Math.floor(raw.step)
      : 0;

  const action: ActionType =
    typeof raw.action === "string" && VALID_ACTIONS.has(raw.action)
      ? (raw.action as ActionType)
      : "run_command";

  const input = typeof raw.input === "string" ? raw.input : "";
  const output = typeof raw.output === "string" ? raw.output : "";

  const meta =
    raw.metadata && typeof raw.metadata === "object"
      ? (raw.metadata as Record<string, unknown>)
      : {};
  const status = meta.status === "failure" ? "failure" : "success";
  const file = typeof meta.file === "string" ? meta.file : null;

  return {
    session_id,
    timestamp,
    step,
    action,
    input,
    output,
    metadata: { file, status },
  };
}

export function ingestEvent(raw: RawEvent, store: SessionStore): Event | null {
  const event = normalize(raw);
  if (!event) return null;

  const session = store.getOrCreate(event.session_id);

  const key = eventDedupKey(event);
  if (session.dedupSet.has(key)) return null;
  session.dedupSet.add(key);

  sortedInsert(session.events, event);

  if (session.events.length > CONFIG.store.maxEventsPerSession) {
    session.events.shift();
  }

  return event;
}
