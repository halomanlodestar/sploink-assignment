/** @format */

import Link from "next/link";
import { getSessions } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { EventFileUpload } from "@/components/EventFileUpload";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function Home() {
  let sessions;
  try {
    sessions = await getSessions();
  } catch {
    sessions = null;
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Agent Monitor
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live session activity across all agent runs
          </p>
        </div>
        <EventFileUpload />
      </div>

      {sessions === null ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-6 py-8 text-center text-sm text-destructive">
          Could not connect to the server. Make sure the backend is running on{" "}
          <code className="font-mono">localhost:3000</code>.
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
          No sessions yet. Send some events to{" "}
          <code className="font-mono">POST /events</code>.
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Success Rate</TableHead>
                <TableHead>Actions</TableHead>
                <TableHead>Signals</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.session_id}>
                  <TableCell className="font-mono text-xs">
                    <Link
                      href={`/sessions/${encodeURIComponent(s.session_id)}`}
                      className="hover:underline text-foreground"
                    >
                      {s.session_id}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={s.status} />
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {s.event_count}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {(s.metrics.successRatio * 100).toFixed(0)}%
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(s.metrics.actionDistribution).map(
                        ([action, pct]) => (
                          <span
                            key={action}
                            className="text-xs text-muted-foreground font-mono"
                          >
                            {action.replace("_", " ")}{" "}
                            <span className="text-foreground">
                              {(pct * 100).toFixed(0)}%
                            </span>
                          </span>
                        ),
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {s.secondary_signals.map((sig) => (
                        <Badge key={sig} variant="outline" className="text-xs">
                          {sig}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
