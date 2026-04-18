/** @format */

import { SessionStore } from "./src/store.ts";
import { DetectionEngine } from "./src/detection/index.ts";
import { handlePostEvents } from "./src/api/events.ts";
import { handleGetSessions, handleGetSession } from "./src/api/sessions.ts";

const store = new SessionStore();
const engine = new DetectionEngine();

const PORT = Number(process.env.PORT ?? 8000);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    if (req.method === "POST" && pathname === "/events") {
      return handlePostEvents(req, store, engine);
    }

    if (req.method === "GET" && pathname === "/sessions") {
      return handleGetSessions(store);
    }

    if (req.method === "GET" && pathname.startsWith("/sessions/")) {
      const session_id = decodeURIComponent(
        pathname.slice("/sessions/".length),
      );
      if (session_id) return handleGetSession(session_id, store);
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
});

console.log(`Listening on port ${PORT}`);
