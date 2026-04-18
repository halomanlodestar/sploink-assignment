/** @format */

import { z } from "zod";
import type { Event } from "../types.ts";
import { SessionStore } from "../store.ts";
import { CONFIG } from "../config.ts";
import { eventDedupKey } from "./dedup.ts";
import { sortedInsert } from "./reorder.ts";

const RawEventSchema = z.object({
  session_id: z.string().trim().min(1),
  timestamp: z.number().default(() => Date.now()),
  step: z.number().transform(Math.floor).default(0),
  action: z
    .enum(["read_file", "write_file", "run_command", "llm_call"])
    .default("run_command"),
  input: z.string().default(""),
  output: z.string().default(""),
  metadata: z
    .object({
      file: z.string().nullable().default(null),
      status: z.enum(["success", "failure"]).default("success"),
    })
    .default({ file: null, status: "success" }),
});

function normalize(raw: unknown): Event | null {
  const result = RawEventSchema.safeParse(raw);
  if (!result.success) return null;
  return result.data;
}

export function ingestEvent(raw: unknown, store: SessionStore): Event | null {
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
