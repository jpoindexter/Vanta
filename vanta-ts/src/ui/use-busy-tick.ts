import { useEffect, useState } from "react";

// Drives the rotating busy verb + spinner. Advances a tick ~every 150ms while a
// turn is running; resets to 0 when idle so the next turn starts fresh. Lives in
// the live region (redraws), never in committed history.

const TICK_MS = 150;

export function useBusyTick(busy: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!busy) { setTick(0); return; }
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, [busy]);
  return tick;
}
