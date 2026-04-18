/** @format */

import type { Event, DriftResult } from "../types.ts";
import type { Config } from "../config.ts";

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "to",
  "and",
  "or",
  "of",
  "in",
  "for",
  "with",
]);
const ACTIONS = ["read_file", "write_file", "run_command", "llm_call"] as const;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function buildFeatureVector(
  events: Event[],
  vocabulary: string[],
  maxKeywords: number,
): number[] {
  const actionCounts: Record<string, number> = {};
  const termCounts = new Map<string, number>();

  for (const e of events) {
    actionCounts[e.action] = (actionCounts[e.action] ?? 0) + 1;
    for (const token of tokenize(e.input)) {
      termCounts.set(token, (termCounts.get(token) ?? 0) + 1);
    }
  }

  const total = events.length || 1;

  // 4 action dims
  const actionDims = ACTIONS.map((a) => (actionCounts[a] ?? 0) / total);

  // keyword dims aligned to shared vocabulary (capped to maxKeywords)
  const keywordDims = vocabulary.slice(0, maxKeywords).map((term) => {
    return (termCounts.get(term) ?? 0) / total;
  });

  return [...actionDims, ...keywordDims];
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    magA += (a[i] ?? 0) ** 2;
    magB += (b[i] ?? 0) ** 2;
  }
  if (magA === 0 || magB === 0) return 1;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function topTerms(events: Event[], k: number): string[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    for (const token of tokenize(e.input)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([term]) => term);
}

export function computeDriftResult(
  events: Event[],
  cfg: Config["drift"],
): DriftResult {
  if (events.length < cfg.minEvents) {
    return { drifting: false, driftStep: null, similarity: 1 };
  }

  const W = cfg.windowSize;
  const historical = events.slice(0, events.length - W);
  const recent = events.slice(events.length - W);

  // Build shared vocabulary from both slices combined, capped to maxKeywords
  const allVocab = topTerms(
    [...historical, ...recent],
    cfg.maxKeywordsPerWindow,
  );

  const histVec = buildFeatureVector(
    historical,
    allVocab,
    cfg.maxKeywordsPerWindow,
  );
  const recentVec = buildFeatureVector(
    recent,
    allVocab,
    cfg.maxKeywordsPerWindow,
  );

  const similarity = cosineSimilarity(histVec, recentVec);
  const drifting = similarity < cfg.similarityThreshold;
  const driftStep = drifting ? (recent[0]?.step ?? null) : null;

  return { drifting, driftStep, similarity };
}
