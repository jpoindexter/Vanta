import { useEffect, useRef, type Dispatch } from "react";
import { useInput } from "ink";
import type { Action } from "./app-reducer.js";

// Mouse/trackpad scrolling for the alt-screen TUI. An alternate screen has no
// scrollback, and terminals send wheel/two-finger-scroll gestures to the app
// ONLY when it opts into mouse reporting — so we enable mouse tracking + SGR
// encoding while mounted, and parse the wheel reports INSIDE Ink's input
// pipeline via useInput. Never attach a raw stdin 'data' listener for this:
// Ink reads stdin in paused mode ('readable' + read()), and a parallel 'data'
// listener races the stream mode and silently misses chunks. Ink hands
// unrecognized CSI sequences to useInput as text with the ESC prefix stripped.
// Trackpads emit a high-frequency event stream (momentum), so events
// accumulate and convert to one entry-step per WHEEL_EVENTS_PER_STEP — the
// classic 3-lines-per-notch convention. Text selection while mouse reporting
// is on needs the terminal's override modifier (⌥ on iTerm2, fn on Terminal).

const ENABLE_MOUSE = "\x1b[?1000;1006h";
const DISABLE_MOUSE = "\x1b[?1000;1006l";
const WHEEL_EVENTS_PER_STEP = 3;

// SGR encoding only (DECSET 1006): CSI < Pb ; Px ; Py M — wheel up = 64,
// down = 65. The ESC may already be stripped by Ink's key parser, so it's
// optional here. Legacy X10 encoding is deliberately NOT supported: its three
// raw payload bytes follow the final byte, so Ink's CSI parser splits the
// report apart and the payload would leak into the composer as typed text.
// Every modern terminal (Ghostty, iTerm2, Terminal.app, kitty) does SGR.
const SGR_WHEEL_RE = /(?:\x1b)?\[<(6[45]);\d+;\d+[Mm]/g;

/** Count wheel events in an input chunk. Pure — tested directly. */
export function countWheelEvents(chunk: string): { up: number; down: number } {
  let up = 0;
  let down = 0;
  for (const m of chunk.matchAll(SGR_WHEEL_RE)) {
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
  const accRef = useRef(0);

  useEffect(() => {
    if (!altScreen || !process.stdout.isTTY) return;
    const disable = (): void => { process.stdout.write(DISABLE_MOUSE); };
    process.stdout.write(ENABLE_MOUSE);
    process.on("exit", disable); // crash-path: don't leave the terminal in mouse mode
    return () => {
      process.off("exit", disable);
      disable();
    };
  }, [altScreen]);

  useInput((input) => {
    const { up, down } = countWheelEvents(input);
    if (up === 0 && down === 0) return;
    const r = accumulateWheel(accRef.current, up, down);
    accRef.current = r.acc;
    if (r.steps !== 0) dispatch({ t: "scrollBy", delta: r.steps });
  }, { isActive: altScreen });
}
