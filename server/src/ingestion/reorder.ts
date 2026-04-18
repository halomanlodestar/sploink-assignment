/** @format */

import type { Event } from "../types.ts";

export function sortedInsert(events: Event[], event: Event): void {
  let lo = 0;
  let hi = events.length;

  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const m = events[mid]!;
    if (
      m.step < event.step ||
      (m.step === event.step && m.timestamp <= event.timestamp)
    ) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  events.splice(lo, 0, event);
}
