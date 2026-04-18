/** @format */

import type { SessionState, DetectionState } from "./types.ts";

function makeDetectionState(): DetectionState {
  return {
    loop: {
      buffer: [],
      bufferFill: 0,
      head: 0,
    },
    failure: {
      ema: 0,
      eventsSeen: 0,
      firstFiveResults: [],
      streak: 0,
      recentWindow: [],
    },
    driftEventCount: 0,
  };
}

function makeSessionState(session_id: string): SessionState {
  return {
    session_id,
    events: [],
    dedupSet: new Set(),
    detectionState: makeDetectionState(),
    cachedResult: null,
  };
}

export class SessionStore {
  private sessions = new Map<string, SessionState>();

  getOrCreate(session_id: string): SessionState {
    let session = this.sessions.get(session_id);

    if (!session) {
      session = makeSessionState(session_id);
      this.sessions.set(session_id, session);
    }

    return session;
  }

  get(session_id: string): SessionState | undefined {
    return this.sessions.get(session_id);
  }

  getAll(): SessionState[] {
    return Array.from(this.sessions.values());
  }
}
