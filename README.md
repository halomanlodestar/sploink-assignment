<!-- @format -->

# Agent Monitoring System

A real-time monitoring system for AI agents that ingests event streams, detects behavioral anomalies (loops, drift, failures), and surfaces insights through a web UI.

---

## Setup Instructions

### Prerequisites

- [Bun](https://bun.sh)

### 1. Install dependencies

From the repository root:

```bash
bun install
```

### 2. Start the server

```bash
cd server
bun run dev       # development (watch mode)
# or
bun run start     # production
```

The server starts on **http://localhost:8000**.

### 3. Start the web frontend

In a separate terminal:

```bash
cd web
bun run dev
```

The UI is available at **http://localhost:3000** (Next.js default).

### 4. Send events

```bash
curl -X POST http://localhost:8000/events \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "agent-42",
    "timestamp": 1713500000123,
    "step": 1,
    "action": "read_file",
    "input": "/tmp/config.txt",
    "output": "port: 8080",
    "metadata": { "status": "success" }
  }'
```

You can also POST an array of events in a single request.

### 5. Run the agent simulator

`agent.py` is a Python CLI that generates realistic event streams and sends them to the server. It requires Python 3 (stdlib only — no dependencies to install).

**Single scenario — send directly to the server:**

```bash
# Healthy agent — logical progression of steps
python agent.py --scenario normal --send http://localhost:8000

# Agent stuck in a behavioral loop
python agent.py --scenario loop --send http://localhost:8000

# Agent that drifts mid-session (auth → deployment)
python agent.py --scenario drift --send http://localhost:8000

# Agent with escalating failures / retries
python agent.py --scenario failure --send http://localhost:8000
```

**Mixed / all scenarios in one shot:**

```bash
# Interleaved stream from all 4 scenarios (multiple concurrent sessions)
python agent.py --scenario mixed --send http://localhost:8000

# All 4 scenarios as separate sessions, written to a file
python agent.py --scenario all --output events.json
```

**Continuous burst mode** (stress-tests debounce and burst handling):

```bash
# 3 concurrent sessions, random batches, until Ctrl+C
python agent.py --burst --send http://localhost:8000 --burst-sessions 3
```

**Other flags:**

| Flag                 | Default | Description                                                                  |
| -------------------- | ------- | ---------------------------------------------------------------------------- |
| `--seed N`           | `42`    | Random seed for reproducibility                                              |
| `--no-noise`         | off     | Skip edge-case injection (duplicates, out-of-order events, missing metadata) |
| `--output FILE`      | stdout  | Write JSON event array to a file instead of sending                          |
| `--burst-sessions N` | `3`     | Number of concurrent sessions in burst mode                                  |

---

## Architecture Overview

```
POST /events
     │
     ▼
┌─────────────────────────────────────────┐
│              Ingestion Pipeline         │
│  Validate → Normalize → Deduplicate     │
│           → Sorted Insert               │
└──────────────────┬──────────────────────┘
                   │ O(1) incremental update
                   ▼
┌─────────────────────────────────────────┐
│             Detection Engine            │
│  Loop state  │  Failure state  (sync)   │
│  ─────────────────────────────────────  │
│  Debounce 50ms / flush every 200ms      │
│  → Loop result + Failure result         │
│  → Drift result (batch over event list) │
│  → Write cachedResult                   │
└──────────────────┬──────────────────────┘
                   │
         ┌─────────┴──────────┐
         ▼                    ▼
  GET /sessions        GET /sessions/:id
  (cached result)      (full detail + timeline)
         │
         ▼
  Next.js Frontend
  Session list → Session detail
```

### Key components

| Path                    | Responsibility                           |
| ----------------------- | ---------------------------------------- |
| `server/src/ingestion/` | Validation, deduplication, sorted insert |
| `server/src/detection/` | Loop, drift, and failure detectors       |
| `server/src/store.ts`   | In-memory `SessionStore` (one Map)       |
| `server/src/metrics.ts` | Per-session metric computation           |
| `server/src/api/`       | HTTP route handlers                      |
| `server/index.ts`       | `Bun.serve` entry point, route wiring    |
| `web/src/`              | Next.js 16 frontend (App Router)         |

### Event lifecycle

1. **Validation** — missing fields are filled with safe defaults (`status: "success"`, `file: null`). Requests without `session_id` are rejected with `400`.
2. **Deduplication** — events are hashed on `(session_id, timestamp, step, action, input)`. True duplicates (e.g. network retries) are dropped silently; re-reads of the same file at a different timestamp are not duplicates and pass through.
3. **Sorted insert** — binary search on `step` inserts events in order regardless of arrival order, with `timestamp` as tiebreaker. Detectors always see events in step order.
4. **Incremental state update** — loop and failure state are updated in O(1) synchronously on every event. Drift is recomputed in batch during the debounced emit step.
5. **Debounced emit** — during high-frequency bursts, the cached detection result is written at most once per 50ms idle period, with a hard flush every 200ms. `GET /sessions` always serves a stable, burst-complete snapshot.

---

## Detection Logic

### Loop Detection

**Goal**: identify repeated behavioral patterns even when individual events have slight surface variations (different filenames, different LLM prompts).

**Normalization (`fingerprint`)**: each event is reduced to a canonical string — lowercase, strip digits, strip UUIDs, take path basename, keep first 5 tokens — and prepended with its action type. Example: `read_file("/tmp/config_v3.txt")` → `"read_file:config"`.

**Algorithm**: fingerprints are pushed into a circular buffer of the last 30 events. All n-grams of length 2, 3, and 4 are extracted from the buffer. The score is:

$$\text{score} = \frac{\max_{n,\text{gram}}(\text{count}(gram) \times n)}{\text{buffer size}}$$

**Threshold**: `score > 0.25`. A 3-step cycle repeating 3 times covers 9 of 30 buffer slots (score 0.30), which is a definitive loop. Below 0.25 could plausibly be coincidental repetition.

**Cold start**: no verdict until 10 events are in the buffer.

---

### Drift Detection

**Goal**: identify when an agent changes its intent or direction mid-session — not just action types, but _what_ it is doing with them.

**Algorithm**: the event list is split into two disjoint slices — all events except the last 15 (historical) and the last 15 (recent). For each slice a feature vector is built: action-type frequencies (4 dimensions, normalized) concatenated with top-20 input keyword frequencies (stop-words stripped, normalized). **Cosine similarity** is computed between the two vectors.

$$\text{similarity} = \frac{\vec{A} \cdot \vec{B}}{|\vec{A}||\vec{B}|}$$

**Threshold**: `similarity < 0.6`. A fully pivoted agent scores ~0.1; a naturally progressing agent scores > 0.8.

**Drift step**: the exact step number where the recent window first diverged is recorded and surfaced in the session detail.

**Cold start guard**: no verdict until 25 total events. With fewer events the historical slice is too thin.

---

### Failure Detection

**Goal**: catch multiple failure shapes — gradual degradation, a specific stuck operation, and an acute failure streak.

Three independent signals are computed:

| Signal                 | Mechanism                                                             | Threshold         |
| ---------------------- | --------------------------------------------------------------------- | ----------------- |
| **EMA**                | `ema = 0.3 × result + 0.7 × ema`, initialized from first 5 events     | `ema < 0.4`       |
| **Retry pattern**      | Same normalized fingerprint fails ≥ 2 times within the last 30 events | Fires immediately |
| **Consecutive streak** | Simple counter, resets on success                                     | `streak ≥ 3`      |

**Composite rule**:

```
failing = retry_fired OR (ema_fired AND streak_fired)
```

Retry alone is a precise signal (stuck on one operation). EMA alone is not (could be recovering). Streak alone is not (could be a brief bad patch). Both EMA and streak together = unambiguously failing.

**Cold start**: no verdict until 5 events are seen (needed to initialize EMA).

---

### Status and Secondary Signals

A session's primary `status` is `"looping"`, `"drifting"`, `"failing"`, or `"healthy"` (in priority order). If a session is failing _because_ it is also looping, both pieces of information are preserved: `{ status: "failing", secondary_signals: ["looping"] }`.

---

## Trade-offs

### In-memory storage vs. a database

**Choice**: all state is held in a single `Map` in the Bun process.  
**Why**: zero latency, no serialization overhead, no external dependency — sufficient for a local assignment. A hard cap of 1,000 events per session prevents unbounded memory growth.  
**Cost**: all data is lost on process restart. For production this would be replaced with Redis or a time-series DB.

### Real-time incremental updates vs. batch recomputation

**Choice**: loop and failure detectors maintain running state updated in O(1) per event. Drift is recomputed in batch (O(n)) only during the debounced emit, not on every event.  
**Why**: drift requires comparing two time-window slices of the full event list; there is no clean O(1) incremental form for cosine similarity over shifting windows. Since drift is only written to the cache during the debounce flush, the O(n) cost is paid at most once per 50ms burst, not once per event.

### Synchronous hot path

**Choice**: no `await` between receiving an event and updating in-memory state.  
**Why**: eliminates the possibility of concurrent requests interleaving mutations on the same session. Bun's single-threaded event loop handles all I/O; keeping the update synchronous means each request sees a fully consistent state.

### Debounce on emit, not on compute

**Choice**: incremental state is always current; only writing the cached result is debounced.  
**Why**: during a 100-event burst you want detection to reflect all 100 events when `GET /sessions` is called, not just the first 1 that arrived before the debounce timer expired. Separating "update state" (eager) from "write cache" (debounced) gives you both freshness and stability.

### Fixed sliding window for drift (W=15)

**Choice**: always compare the last 15 events against everything before them.  
**Why**: a fixed-bucket approach (early/mid/late thirds) requires knowing the total session length, which you don't have mid-stream. The sliding window gives a meaningful "before" and "now" at any point in the session's life.

### No authentication / persistence

**Choice**: the API has no auth and no disk writes.  
**Why**: scope is a local development tool. Adding auth or persistence would be the first step before any real deployment.
