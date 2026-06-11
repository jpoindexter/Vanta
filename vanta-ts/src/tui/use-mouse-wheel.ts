import { useEffect, type Dispatch } from "react";
import type { Action } from "./app-reducer.js";

// Mouse/trackpad scrolling for the alt-screen TUI. An alternate screen has no
// scrollback, and terminals send wheel/two-finger-scroll gestures to the app
// ONLY when it opts into mouse reporting — so we enable SGR mouse mode
// (CSI ?1000;1006 h) while mounted and translate wheel events into scrollBy
// dispatches. Trackpads emit a high-frequency event stream (momentum), so
// events accumulate and convert to one entry-step per WHEEL_EVENTS_PER_STEP —
// the classic 3-lines-per-notch convention. Text selection in mouse-reporting
// mode needs the terminal's override modifier (⌥ on iTerm2, fn on Terminal).

const ENABLE_MOUSE = "\x1b[?1000;1006h";
const DISABLE_MOUSE = "\x1b[?1000;1006l";
const WHEEL_EVENTS_PER_STEP = 3;

// SGR wheel codes: 64 = wheel/track up, 65 = down ('M' = press; wheels never release).
const WHEEL_RE = /\x1b\[<(6[45]);\d+;\d+M/g;

/** Count wheel events in a raw stdin chunk. Pure — tested directly. */
export function countWheelEvents(chunk: string): { up: number; down: number } {
  let up = 0;
  let down = 0;
  for (const m of chunk.matchAll(WHEEL_RE)) {
    if (m[1] === "64") up++;
    else down++;
  }
  return { up, down };
}

/** Fold a wheel-event count into the accumulator; returns entry steps to scroll
 * (positive = older/up) and the leftover remainder. Pure — tested directly. */
export function accumulateWheel(acc: number, up: number, down: number): { steps: number; acc: number } {
  const next = acc + up - down;
  const steps = Math.trunc(next / WHEEL_EVENTS_PER_STEP);
  return { steps, acc: next - steps * WHEEL_EVENTS_PER_STEP };
}

/** Enable terminal mouse reporting while mounted (alt-screen only) and turn
 * wheel/trackpad scroll into transcript scrollBy dispatches. */
export function useMouseWheel(altScreen: boolean, dispatch: Dispatch<Action>): void {
  useEffect(() => {
    if (!altScreen || !process.stdout.isTTY || !process.stdin.isTTY) return;
    let acc = 0;
    const onData = (data: Buffer | string): void => {
      const { up, down } = countWheelEvents(data.toString("utf8"));
      if (up === 0 && down === 0) return;
      const r = accumulateWheel(acc, up, down);
      acc = r.acc;
      if (r.steps !== 0) dispatch({ t: "scrollBy", delta: r.steps });
    };
    const disable = (): void => { process.stdout.write(DISABLE_MOUSE); };
    process.stdout.write(ENABLE_MOUSE);
    process.stdin.on("data", onData);
    process.on("exit", disable); // crash-path: don't leave the terminal in mouse mode
    return () => {
      process.stdin.off("data", onData);
      process.off("exit", disable);
      disable();
    };
  }, [altScreen, dispatch]);
}
