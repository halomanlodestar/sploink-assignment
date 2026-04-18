/** @format */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let session;
  try {
    session = await getSession(decodeURIComponent(id));
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "Session not found") notFound();
    throw e;
  }

  const { metrics, detection, events } = session;

  return (
    <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-foreground mb-2 inline-block"
          >
            ← All sessions
          </Link>
          <h1 className="text-xl font-semibold font-mono">
            {session.session_id}
          </h1>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={session.status} />
          {session.secondary_signals.length > 0 && (
            <div className="flex gap-1 flex-wrap justify-end">
              {session.secondary_signals.map((s) => (
                <Badge key={s} variant="outline" className="text-xs">
                  {s}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Steps
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {metrics.totalSteps}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Success Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {(metrics.successRatio * 100).toFixed(0)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Action Mix
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-0.5">
              {Object.entries(metrics.actionDistribution).map(
                ([action, pct]) => (
                  <div key={action} className="flex justify-between text-sm">
                    <span className="text-muted-foreground font-mono text-xs">
                      {action}
                    </span>
                    <span className="tabular-nums text-xs">
                      {(pct * 100).toFixed(0)}%
                    </span>
                  </div>
                ),
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detection detail */}
      <div>
        <h2 className="text-base font-semibold mb-3">Detected Issues</h2>
        <div className="grid grid-cols-3 gap-4">
          <DetectionCard
            title="Loop"
            active={detection.loop.looping}
            detail={`Score: ${detection.loop.score.toFixed(3)}`}
          />
          <DetectionCard
            title="Drift"
            active={detection.drift.drifting}
            detail={
              detection.drift.drifting && detection.drift.driftStep != null
                ? `From step ${detection.drift.driftStep} · similarity ${detection.drift.similarity.toFixed(2)}`
                : `Similarity: ${detection.drift.similarity.toFixed(2)}`
            }
          />
          <DetectionCard
            title="Failure"
            active={detection.failure.failing}
            detail={
              detection.failure.signals.length > 0
                ? `Signals: ${detection.failure.signals.join(", ")}`
                : "No active failure signals"
            }
          />
        </div>
      </div>

      <Separator />

      {/* Event timeline */}
      <div>
        <h2 className="text-base font-semibold mb-3">Event Timeline</h2>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Step</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Input</TableHead>
                <TableHead>Output</TableHead>
                <TableHead className="w-20">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((ev, i) => (
                <TableRow key={i}>
                  <TableCell className="tabular-nums text-muted-foreground text-xs">
                    {ev.step}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {ev.action}
                  </TableCell>
                  <TableCell className="text-xs max-w-xs truncate font-mono text-muted-foreground">
                    {ev.input || "—"}
                  </TableCell>
                  <TableCell className="text-xs max-w-xs truncate text-muted-foreground">
                    {ev.output || "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        ev.metadata.status === "success"
                          ? "text-xs text-green-600 dark:text-green-400"
                          : "text-xs text-red-600 dark:text-red-400"
                      }
                    >
                      {ev.metadata.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </main>
  );
}

function DetectionCard({
  title,
  active,
  detail,
}: {
  title: string;
  active: boolean;
  detail: string;
}) {
  return (
    <Card className={active ? "border-destructive/50" : ""}>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              active ? "bg-destructive" : "bg-green-500"
            }`}
          />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
