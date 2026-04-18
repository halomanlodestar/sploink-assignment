/** @format */

import type { RawEvent } from "../types.ts";
import type { SessionStore } from "../store.ts";
import type { DetectionEngine } from "../detection/index.ts";
import { ingestEvent } from "../ingestion/index.ts";

export async function handlePostEvents(
  req: Request,
  store: SessionStore,
  engine: DetectionEngine,
): Promise<Response> {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raws: RawEvent[] = Array.isArray(body) ? body : [body];

  if (raws.length === 0) {
    return Response.json({ error: "Empty event array" }, { status: 400 });
  }

  let accepted = 0;
  let dropped = 0;

  for (const raw of raws) {
    const event = ingestEvent(raw as RawEvent, store);
    if (event) {
      const session = store.get(event.session_id)!;
      engine.onEvent(session, event);
      accepted++;
    } else {
      dropped++;
    }
  }

  if (accepted === 0) {
    return Response.json(
      { error: "All events invalid or duplicate", dropped },
      { status: 400 },
    );
  }

  return Response.json({ accepted, dropped }, { status: 200 });
}
