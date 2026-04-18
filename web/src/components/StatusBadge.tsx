/** @format */

import { Badge } from "@/components/ui/badge";

type Status = "healthy" | "looping" | "drifting" | "failing";

const variants: Record<
  Status,
  "default" | "secondary" | "destructive" | "outline"
> = {
  healthy: "default",
  looping: "secondary",
  drifting: "outline",
  failing: "destructive",
};

const labels: Record<Status, string> = {
  healthy: "Healthy",
  looping: "Looping",
  drifting: "Drifting",
  failing: "Failing",
};

export function StatusBadge({ status }: { status: Status }) {
  return <Badge variant={variants[status]}>{labels[status]}</Badge>;
}
