/** @format */

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postEvents } from "@/lib/api";
import { Button } from "@/components/ui/button";

type UploadState =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | { kind: "done"; accepted: number; dropped: number };

function parseFile(text: string): unknown[] {
  const trimmed = text.trim();

  // Try JSON array first
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) throw new Error("Expected a JSON array");
    return parsed;
  }

  // Fall back to JSONL (one JSON object per non-empty line)
  const lines = trimmed.split("\n").filter((l) => l.trim().length > 0);
  return lines.map((line, i) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`Line ${i + 1} is not valid JSON`);
    }
  });
}

export function EventFileUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function handleFile(file: File) {
    setState({ kind: "idle" });

    let events: unknown[];
    try {
      const text = await file.text();
      events = parseFile(text);
    } catch (e) {
      setState({
        kind: "error",
        message: `Could not parse file: ${(e as Error).message}`,
      });
      return;
    }

    if (events.length === 0) {
      setState({ kind: "error", message: "File contains no events" });
      return;
    }

    try {
      const result = await postEvents(events);
      setState({
        kind: "done",
        accepted: result.accepted,
        dropped: result.dropped,
      });
      // Refresh the server component session list
      startTransition(() => router.refresh());
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message });
    }
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept=".json,.jsonl"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          // Reset so the same file can be re-uploaded
          e.target.value = "";
        }}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => inputRef.current?.click()}
      >
        {isPending ? "Refreshing…" : "Upload events"}
      </Button>

      {state.kind === "done" && (
        <span className="text-xs text-muted-foreground">
          <span className="text-green-600 dark:text-green-400 font-medium">
            {state.accepted} accepted
          </span>
          {state.dropped > 0 && (
            <>
              ,{" "}
              <span className="text-yellow-600 dark:text-yellow-400">
                {state.dropped} dropped
              </span>
            </>
          )}
        </span>
      )}

      {state.kind === "error" && (
        <span className="text-xs text-destructive">{state.message}</span>
      )}
    </div>
  );
}
