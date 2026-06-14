import { useEffect, useState } from "react";

// A blink phase that flips every `ms`, for a composer cursor that pulses "alive"
// (the canonical terminal ready-cue). Self-contained — one small interval local
// to the composer, separate from the App's 1 Hz session clock. ~530ms matches a
// natural terminal blink. Returns true (cursor shown) on the leading phase.

export function useBlink(ms = 530): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setOn((v) => !v), ms);
    return () => clearInterval(id);
  }, [ms]);
  return on;
}
