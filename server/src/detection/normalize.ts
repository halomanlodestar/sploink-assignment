/** @format */

import path from "node:path";

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const DIGITS_RE = /\d+/g;
const NONWORD_RE = /[^a-z\s]+/g;
const WHITESPACE_RE = /\s+/g;

function normalizeInput(input: string): string {
  let s = input.trim().toLowerCase();

  if (s.includes("/") || s.includes("\\")) {
    s = path.basename(s);
    s = s.replace(/\.[^.]+$/, "");
  }

  s = s.replace(UUID_RE, "");
  s = s.replace(DIGITS_RE, "");
  s = s.replace(NONWORD_RE, " ");
  s = s.replace(WHITESPACE_RE, " ").trim();

  return s.split(" ").filter(Boolean).slice(0, 5).join(" ");
}

export function fingerprint(action: string, input: string): string {
  return `${action}:${normalizeInput(input)}`;
}
