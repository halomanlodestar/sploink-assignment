#!/usr/bin/env python3
"""
agent.py — AI Agent Simulator CLI
Generates realistic event streams to test the agent monitoring server.

Usage:
  python agent.py --scenario normal   --send http://localhost:8000
  python agent.py --scenario loop     --output events.json
  python agent.py --scenario drift    --send
  python agent.py --scenario failure  --send
  python agent.py --scenario mixed    --send
  python agent.py --scenario all      --output events.json
  python agent.py --burst             --send --burst-sessions 3
"""

import argparse
import json
import random
import sys
import time
import urllib.error
import urllib.request
from typing import Any

# ---------------------------------------------------------------------------
# Event builder
# ---------------------------------------------------------------------------

ACTIONS = ["read_file", "write_file", "run_command", "llm_call"]


def make_event(
    session_id: str,
    step: int,
    action: str,
    inp: str,
    out: str,
    status: str,
    ts: int,
    include_metadata: bool = True,
) -> dict[str, Any]:
    ev: dict[str, Any] = {
        "session_id": session_id,
        "timestamp": ts,
        "step": step,
        "action": action,
        "input": inp,
        "output": out,
    }
    if include_metadata:
        ev["metadata"] = {"status": status}
    return ev


# ---------------------------------------------------------------------------
# Scenario: normal
# Logical 5-phase progression, ~40 events, ~85% success, stays "healthy"
# ---------------------------------------------------------------------------

def generate_normal(session_id: str, rng: random.Random) -> list[dict]:
    ts = int(time.time() * 1000) - 60_000
    step = 1
    events: list[dict] = []

    # Phase 1 — scaffold / plan
    plan_tasks = [
        ("llm_call", "outline plan for implementing user auth module", "Plan: 1) design schema 2) write middleware 3) add tests"),
        ("read_file", "src/project.config.json", '{"name":"app","version":"1.0"}'),
        ("read_file", "src/routes/index.ts", "export const router = Router();"),
    ]
    for action, inp, out in plan_tasks:
        events.append(make_event(session_id, step, action, inp, out, "success", ts))
        ts += rng.randint(200, 800)
        step += 1

    # Phase 2 — read source
    files = [
        "src/middleware/auth.ts",
        "src/models/user.ts",
        "src/utils/token.ts",
        "src/routes/auth.ts",
        "tests/auth.test.ts",
    ]
    for f in files:
        events.append(make_event(session_id, step, "read_file", f, f"contents of {f}", "success", ts))
        ts += rng.randint(100, 400)
        step += 1

    # Phase 3 — analyze with LLM
    analysis_prompts = [
        ("llm_call", "analyze auth middleware for security issues", "Found: missing rate limiting, token expiry not checked"),
        ("llm_call", "suggest fix for token expiry validation", "Add: if (token.exp < Date.now()) throw new UnauthorizedException()"),
        ("llm_call", "review user model schema", "Schema looks correct, add index on email field"),
    ]
    for action, inp, out in analysis_prompts:
        events.append(make_event(session_id, step, action, inp, out, "success", ts))
        ts += rng.randint(500, 1500)
        step += 1

    # Phase 4 — implement
    writes = [
        ("write_file", "src/middleware/auth.ts", "Updated middleware with rate limiting"),
        ("write_file", "src/utils/token.ts", "Added expiry validation logic"),
        ("write_file", "src/models/user.ts", "Added email index"),
        ("run_command", "tsc --noEmit", ""),
        ("run_command", "eslint src/", ""),
    ]
    for action, inp, out in writes:
        # Occasional failure (compile warning etc)
        status = "failure" if rng.random() < 0.15 else "success"
        if status == "failure":
            out = "error: type mismatch on line 42"
        events.append(make_event(session_id, step, action, inp, out, status, ts))
        ts += rng.randint(300, 900)
        step += 1

    # Phase 5 — verify / test
    test_cmds = [
        "jest tests/auth.test.ts",
        "jest tests/user.test.ts",
        "jest --coverage",
        "npm run build",
    ]
    for cmd in test_cmds:
        status = "failure" if rng.random() < 0.1 else "success"
        out = "All tests passed" if status == "success" else "1 test failed"
        events.append(make_event(session_id, step, "run_command", cmd, out, status, ts))
        ts += rng.randint(400, 1200)
        step += 1

    # Remaining filler — varied read/write/llm
    misc = [
        ("read_file", "README.md", "# App"),
        ("llm_call", "write changelog entry for auth module", "Added JWT auth with refresh tokens"),
        ("write_file", "CHANGELOG.md", "v1.1.0: Added JWT auth"),
        ("run_command", "git diff --stat", "5 files changed"),
        ("llm_call", "summarize changes made in this session", "Implemented auth middleware with rate limiting and token expiry"),
        ("read_file", "package.json", '{"dependencies":{}}'),
        ("run_command", "git status", "nothing to commit"),
    ]
    for action, inp, out in misc:
        status = "failure" if rng.random() < 0.05 else "success"
        events.append(make_event(session_id, step, action, inp, out, status, ts))
        ts += rng.randint(200, 600)
        step += 1

    return events


# ---------------------------------------------------------------------------
# Scenario: loop
# 15 warmup + 15 loop events (5 cycles × 3-step)
# After fingerprint normalization, 3-gram score = 5×3/30 = 0.5 >> 0.25 threshold
# Non-trivial: each iteration uses different version numbers + slightly varied LLM prompts
# ---------------------------------------------------------------------------

def generate_loop(session_id: str, rng: random.Random) -> list[dict]:
    ts = int(time.time() * 1000) - 45_000
    step = 1
    events: list[dict] = []

    # Warmup — 15 varied events that don't form cycles
    warmup = [
        ("read_file", "src/config.yaml", "port: 8080"),
        ("llm_call", "list all configuration options for service", "Options: port, host, timeout, retries"),
        ("write_file", "src/config.yaml", "port: 8080\nhost: 0.0.0.0"),
        ("run_command", "cat src/config.yaml", "port: 8080"),
        ("read_file", "src/service.ts", "class Service { ... }"),
        ("llm_call", "explain what this service class does", "This class handles HTTP requests"),
        ("run_command", "npm test", "3 tests passed"),
        ("read_file", "src/utils/logger.ts", "export const log = console.log"),
        ("llm_call", "suggest improvements to logger utility", "Add log levels and timestamps"),
        ("write_file", "src/utils/logger.ts", "Updated logger with levels"),
        ("run_command", "tsc --noEmit", "No errors"),
        ("read_file", "src/api/router.ts", "const router = Router()"),
        ("llm_call", "check router for missing error handlers", "Add 404 and 500 handlers"),
        ("write_file", "src/api/router.ts", "Added 404 handler"),
        ("run_command", "git add -p", "Staged changes"),
    ]
    for action, inp, out in warmup:
        events.append(make_event(session_id, step, action, inp, out, "success", ts))
        ts += rng.randint(200, 600)
        step += 1

    # Loop — 5 cycles of [read_file, llm_call, write_file]
    # Surface variation: different version numbers, slightly different LLM prompts
    # Normalized fingerprints (digits stripped, basename, first 5 tokens):
    #   read_file  → "read_file:handler"
    #   llm_call   → "llm_call:analyze handler function near line"
    #   write_file → "write_file:handler"
    for cycle in range(5):
        v_in = cycle + 1
        v_out = cycle + 2
        line_no = 40 + rng.randint(1, 20)
        variant_words = ["near", "around", "at", "by", "close to"]
        variant = rng.choice(variant_words)

        inp_read = f"src/handlers/handler_v{v_in}.py"
        out_read = f"def handle_request(req):\n    # version {v_in}"
        events.append(make_event(session_id, step, "read_file", inp_read, out_read, "success", ts))
        ts += rng.randint(100, 300)
        step += 1

        inp_llm = f"analyze handler function {variant} line {line_no} and suggest fix"
        out_llm = f"Line {line_no}: missing null check on req.body — add guard"
        events.append(make_event(session_id, step, "llm_call", inp_llm, out_llm, "success", ts))
        ts += rng.randint(400, 900)
        step += 1

        inp_write = f"src/handlers/handler_v{v_out}.py"
        out_write = f"Updated handler to version {v_out} with null check"
        events.append(make_event(session_id, step, "write_file", inp_write, out_write, "success", ts))
        ts += rng.randint(100, 300)
        step += 1

    return events


# ---------------------------------------------------------------------------
# Scenario: drift
# 35 total events (≥25 required). Phase 1 (1-20): auth domain with llm_call-heavy
# distribution. Phase 2 (21-35): deploy domain with run_command-heavy distribution.
# Action cosine: [0.55,0.15,0.05,0.25] vs [0.05,0.15,0.55,0.25] — very different
# Keywords: zero overlap between auth vocab and deploy vocab → similarity << 0.6
# Non-trivial: both phases use all 4 action types
# ---------------------------------------------------------------------------

AUTH_INPUTS = [
    ("llm_call", "design JWT authentication middleware for express"),
    ("llm_call", "review oauth2 token validation logic"),
    ("llm_call", "analyze session credential storage security"),
    ("llm_call", "check permission scope enforcement in auth layer"),
    ("llm_call", "suggest fix for user authentication bypass vulnerability"),
    ("read_file", "src/auth/middleware.ts"),
    ("read_file", "src/auth/token.ts"),
    ("read_file", "src/auth/session.ts"),
    ("read_file", "src/models/credential.ts"),
    ("write_file", "src/auth/middleware.ts"),
    ("write_file", "src/auth/token.ts"),
    ("run_command", "jest tests/auth/"),
]

DEPLOY_INPUTS = [
    ("run_command", "kubectl apply -f deployment/api-deployment.yaml"),
    ("run_command", "docker build -t api-service:latest ."),
    ("run_command", "helm install api-release ./charts/api"),
    ("run_command", "kubectl rollout status deployment/api-service"),
    ("run_command", "kubectl get pods --namespace production"),
    ("run_command", "docker push registry.example.com/api-service:latest"),
    ("read_file", "deployment/api-deployment.yaml"),
    ("read_file", "charts/api/values.yaml"),
    ("read_file", "Dockerfile"),
    ("write_file", "deployment/api-deployment.yaml"),
    ("write_file", "charts/api/values.yaml"),
    ("llm_call", "check kubernetes deployment configuration for issues"),
]


def generate_drift(session_id: str, rng: random.Random) -> list[dict]:
    ts = int(time.time() * 1000) - 50_000
    step = 1
    events: list[dict] = []

    # Phase 1 — auth domain, 20 events
    # Action distribution: ~55% llm_call, ~25% read_file, ~15% write_file, ~5% run_command
    auth_pool = (
        [a for a in AUTH_INPUTS if a[0] == "llm_call"] * 3
        + [a for a in AUTH_INPUTS if a[0] == "read_file"] * 2
        + [a for a in AUTH_INPUTS if a[0] == "write_file"]
        + [a for a in AUTH_INPUTS if a[0] == "run_command"]
    )
    rng.shuffle(auth_pool)
    for i in range(20):
        action, inp = auth_pool[i % len(auth_pool)]
        out = f"processed: {inp}"
        status = "failure" if rng.random() < 0.1 else "success"
        events.append(make_event(session_id, step, action, inp, out, status, ts))
        ts += rng.randint(300, 800)
        step += 1

    # Phase 2 — deploy domain, 15 events
    # Action distribution: ~55% run_command, ~25% read_file, ~15% write_file, ~5% llm_call
    deploy_pool = (
        [a for a in DEPLOY_INPUTS if a[0] == "run_command"] * 3
        + [a for a in DEPLOY_INPUTS if a[0] == "read_file"] * 2
        + [a for a in DEPLOY_INPUTS if a[0] == "write_file"]
        + [a for a in DEPLOY_INPUTS if a[0] == "llm_call"]
    )
    rng.shuffle(deploy_pool)
    for i in range(15):
        action, inp = deploy_pool[i % len(deploy_pool)]
        out = f"executed: {inp}"
        status = "failure" if rng.random() < 0.15 else "success"
        events.append(make_event(session_id, step, action, inp, out, status, ts))
        ts += rng.randint(300, 800)
        step += 1

    return events


# ---------------------------------------------------------------------------
# Scenario: failure
# 5 cold-start (EMA init ≈ 0.6) → 15 healthy (EMA ~0.65) → 20 deteriorating
# After 10 consecutive failures: EMA ≈ 0.018 << 0.4; streak ≥ 3; retry_fired on same fp
# ---------------------------------------------------------------------------

def generate_failure(session_id: str, rng: random.Random) -> list[dict]:
    ts = int(time.time() * 1000) - 55_000
    step = 1
    events: list[dict] = []

    # Cold start — 5 events: S S F S F → EMA init = 3/5 = 0.60
    cold_start = ["success", "success", "failure", "success", "failure"]
    cold_inputs = [
        ("read_file", "src/app.ts", "app source"),
        ("run_command", "npm install", "packages installed"),
        ("run_command", "npm run build", "build failed: missing env"),
        ("read_file", "src/config.ts", "config source"),
        ("run_command", "npm run lint", "lint error: unused variable"),
    ]
    for (action, inp, out), status in zip(cold_inputs, cold_start):
        events.append(make_event(session_id, step, action, inp, out, status, ts))
        ts += rng.randint(300, 700)
        step += 1

    # Healthy phase — 15 events, 75% success (EMA stays ~0.60-0.65)
    healthy = [
        ("read_file", "tests/unit/service.test.ts", "test contents"),
        ("run_command", "jest tests/unit/", "12 tests passed"),
        ("llm_call", "review test coverage for service module", "Coverage 78%, missing edge cases"),
        ("write_file", "tests/unit/service.test.ts", "Added 3 edge case tests"),
        ("run_command", "jest tests/unit/", "15 tests passed"),
        ("read_file", "tests/integration/test_auth.py", "integration test source"),
        ("llm_call", "diagnose why integration tests need a database connection", "Tests require live DB — add docker-compose"),
        ("write_file", "docker-compose.test.yml", "version: 3; services: db: image: postgres"),
        ("run_command", "docker compose -f docker-compose.test.yml up -d", "db started"),
        ("run_command", "pytest tests/integration/ -x", "5 passed"),
        ("read_file", "src/db/connection.ts", "db connection module"),
        ("llm_call", "analyze database connection pooling setup", "Pool size too small for load"),
        ("write_file", "src/db/connection.ts", "Increased pool size to 20"),
        ("run_command", "npm run build", "Build succeeded"),
        ("run_command", "pytest tests/integration/ -x", "5 passed"),
    ]
    for action, inp, out in healthy:
        status = "failure" if rng.random() < 0.25 else "success"
        events.append(make_event(session_id, step, action, inp, out, status, ts))
        ts += rng.randint(200, 600)
        step += 1

    # Deterioration phase — 20 events: gradual then stuck on same broken op
    # Events 1-5: alternating success/failure
    for i in range(5):
        status = "failure" if i % 2 == 1 else "success"
        inp = f"tests/integration/test_auth.py"
        out = "authentication test failed: connection refused" if status == "failure" else "2 passed"
        events.append(make_event(session_id, step, "run_command", f"pytest {inp} -v", out, status, ts))
        ts += rng.randint(400, 800)
        step += 1

    # Events 6-20: all failures on the same operation
    # Fingerprint normalizes to "run_command:pytest test_auth" → retry_fired after ≥2 failures
    for i in range(15):
        attempt_flags = rng.choice(["--tb=short", "--tb=long", "-v", "-x", "--no-header"])
        inp = f"pytest tests/integration/test_auth.py {attempt_flags}"
        out = rng.choice([
            "FAILED tests/integration/test_auth.py::test_login - ConnectionRefusedError",
            "FAILED tests/integration/test_auth.py::test_refresh_token - AssertionError",
            "ERROR: could not connect to test database",
            "FAILED: fixture 'auth_client' not found",
        ])
        events.append(make_event(session_id, step, "run_command", inp, out, "failure", ts))
        ts += rng.randint(500, 1500)
        step += 1

    return events


# ---------------------------------------------------------------------------
# Edge-case noise injection
# ---------------------------------------------------------------------------

def add_noise(events: list[dict], rng: random.Random) -> list[dict]:
    result = list(events)

    # 1. Append 2 exact duplicates (server should dedup these)
    if len(result) >= 2:
        for _ in range(2):
            dupe = dict(rng.choice(result))
            result.append(dupe)

    # 2. Scramble arrival order for ~10% of events (step numbers remain correct)
    n_scramble = max(1, len(result) // 10)
    indices = rng.sample(range(len(result)), min(n_scramble * 2, len(result)))
    for i in range(0, len(indices) - 1, 2):
        result[indices[i]], result[indices[i + 1]] = result[indices[i + 1]], result[indices[i]]

    # 3. Drop metadata from ~5% of events
    for ev in result:
        if rng.random() < 0.05 and "metadata" in ev:
            del ev["metadata"]

    return result


# ---------------------------------------------------------------------------
# Interleave multiple session event lists by timestamp (for --scenario mixed)
# ---------------------------------------------------------------------------

def interleave(lists: list[list[dict]]) -> list[dict]:
    all_events = [ev for lst in lists for ev in lst]
    all_events.sort(key=lambda e: e.get("timestamp", 0))
    return all_events


# ---------------------------------------------------------------------------
# HTTP send (stdlib only)
# ---------------------------------------------------------------------------

def send_events(events: list[dict], base_url: str) -> dict:
    url = base_url.rstrip("/") + "/events"
    payload = json.dumps(events).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {body}") from e


# ---------------------------------------------------------------------------
# Burst mode
# Continuously generates + sends batches until Ctrl+C.
# Uses a pool of sessions cycling through all 4 scenarios.
# Inter-batch delay is randomized to exercise debounce and max-wait paths.
# ---------------------------------------------------------------------------

SCENARIO_GENERATORS = {
    "normal": generate_normal,
    "loop": generate_loop,
    "drift": generate_drift,
    "failure": generate_failure,
}


def run_burst(base_url: str, n_sessions: int, seed: int, noise: bool) -> None:
    rng = random.Random(seed)
    scenarios = list(SCENARIO_GENERATORS.keys())

    # Assign each slot a fixed scenario so the same session consistently triggers
    session_ids = [
        f"burst-{scenarios[i % len(scenarios)]}-{i:02d}" for i in range(n_sessions)
    ]
    session_scenarios = [scenarios[i % len(scenarios)] for i in range(n_sessions)]

    # Pre-generate full event lists for each session
    print(f"[burst] Generating events for {n_sessions} sessions…", file=sys.stderr)
    session_events: list[list[dict]] = []
    for sid, scenario in zip(session_ids, session_scenarios):
        gen = SCENARIO_GENERATORS[scenario]
        evs = gen(sid, rng)
        if noise:
            evs = add_noise(evs, rng)
        session_events.append(evs)

    # Burst loop: send small random slices from each session in turn
    cursors = [0] * n_sessions
    total_sent = 0
    batch_num = 0

    print(f"[burst] Starting continuous burst. Press Ctrl+C to stop.\n", file=sys.stderr)

    try:
        while True:
            # Pick a random session
            idx = rng.randint(0, n_sessions - 1)
            evs = session_events[idx]
            cursor = cursors[idx]

            if cursor >= len(evs):
                # Session exhausted — regenerate it with a fresh seed
                sid = session_ids[idx]
                scenario = session_scenarios[idx]
                new_seed = rng.randint(0, 2**31)
                new_rng = random.Random(new_seed)
                evs = SCENARIO_GENERATORS[scenario](sid, new_rng)
                if noise:
                    evs = add_noise(evs, new_rng)
                session_events[idx] = evs
                cursor = 0

            # Batch size: 1-15 events
            batch_size = rng.randint(1, 15)
            batch = evs[cursor: cursor + batch_size]
            cursors[idx] = cursor + batch_size

            try:
                result = send_events(batch, base_url)
                total_sent += result.get("accepted", 0)
                batch_num += 1
                print(
                    f"\r[burst] batch={batch_num} total_accepted={total_sent} "
                    f"session={session_ids[idx]} sent={len(batch)} "
                    f"accepted={result.get('accepted',0)} dropped={result.get('dropped',0)}",
                    end="",
                    file=sys.stderr,
                )
            except RuntimeError as e:
                print(f"\n[burst] send error: {e}", file=sys.stderr)

            # Randomized delay to simulate varied cadence:
            # 20% chance: near-zero (stress burst) → 0–5ms
            # 60% chance: normal cadence → 50–500ms
            # 20% chance: quiet period → 1–2s
            r = rng.random()
            if r < 0.20:
                delay = rng.uniform(0, 0.005)
            elif r < 0.80:
                delay = rng.uniform(0.05, 0.5)
            else:
                delay = rng.uniform(1.0, 2.0)

            time.sleep(delay)

    except KeyboardInterrupt:
        print(f"\n[burst] Stopped. Total accepted: {total_sent}", file=sys.stderr)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="AI agent event stream simulator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--scenario",
        choices=["normal", "loop", "drift", "failure", "mixed", "all"],
        help="Scenario to generate (omit when using --burst)",
    )
    parser.add_argument(
        "--output",
        metavar="FILE",
        help="Write JSON array to FILE instead of stdout",
    )
    parser.add_argument(
        "--send",
        metavar="URL",
        nargs="?",
        const="http://localhost:8000",
        help="POST events to URL/events (default URL: http://localhost:8000)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        metavar="N",
        help="Random seed for reproducibility (default: 42)",
    )
    parser.add_argument(
        "--no-noise",
        action="store_true",
        help="Skip edge-case noise injection (duplicates, out-of-order, missing metadata)",
    )
    parser.add_argument(
        "--burst",
        action="store_true",
        help="Continuously send random event batches until Ctrl+C",
    )
    parser.add_argument(
        "--burst-sessions",
        type=int,
        default=3,
        metavar="N",
        help="Number of concurrent sessions in burst mode (default: 3)",
    )

    args = parser.parse_args()

    if args.burst:
        if not args.send:
            parser.error("--burst requires --send")
        run_burst(args.send, args.burst_sessions, args.seed, not args.no_noise)
        return

    if not args.scenario:
        parser.error("--scenario is required unless using --burst")

    rng = random.Random(args.seed)
    noise = not args.no_noise

    session_prefix = f"sim-{args.scenario}-{args.seed}"

    if args.scenario == "all":
        all_events: list[dict] = []
        for name, gen in SCENARIO_GENERATORS.items():
            sid = f"sim-{name}-{args.seed}"
            evs = gen(sid, rng)
            if noise:
                evs = add_noise(evs, rng)
            all_events.extend(evs)
        events = all_events

    elif args.scenario == "mixed":
        lists = []
        for name, gen in SCENARIO_GENERATORS.items():
            sid = f"sim-{name}-{args.seed}"
            evs = gen(sid, rng)
            if noise:
                evs = add_noise(evs, rng)
            lists.append(evs)
        events = interleave(lists)

    else:
        gen = SCENARIO_GENERATORS[args.scenario]
        events = gen(session_prefix, rng)
        if noise:
            events = add_noise(events, rng)

    if args.send:
        try:
            result = send_events(events, args.send)
            print(
                f"Sent {len(events)} events → accepted={result.get('accepted')} dropped={result.get('dropped')}",
                file=sys.stderr,
            )
        except RuntimeError as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        output_text = json.dumps(events, indent=2)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(output_text)
            print(f"Wrote {len(events)} events to {args.output}", file=sys.stderr)
        else:
            print(output_text)


if __name__ == "__main__":
    main()
