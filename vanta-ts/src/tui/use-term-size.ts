import { useEffect, useState } from "react";

// Reactive terminal size. Ink re-lays-out on resize, but
// props derived from process.stdout.{rows,columns} are read once per render —
// without this hook a resize never re-renders the React tree, so the alt-screen
// frame keeps a stale height and falls out of Ink's fullscreen/overflow
// clear-terminal regime (the ghost-frame root cause).

export type TermSize = { rows: number; cols: number };

const readSize = (): TermSize => ({
  rows: process.stdout.rows ?? 24,
  cols: process.stdout.columns ?? 80,
});

/** Terminal {rows, cols}, updating on every stdout resize event. */
export function useTermSize(): TermSize {
  const [size, setSize] = useState<TermSize>(readSize);
  useEffect(() => {
    const onResize = (): void => setSize(readSize());
    process.stdout.on("resize", onResize);
    return () => {
      process.stdout.off("resize", onResize);
    };
  }, []);
  return size;
}

/**
 * Debounced redraw nonce for alt-screen mode. macOS animated drags fire a storm
 * of resize events; mid-storm frames can leave artifacts when the terminal
 * rewraps content under Ink. After the storm settles, bumping the nonce forces
 * one more React commit — and because the alt-screen frame intentionally
 * overflows the viewport, that commit takes Ink's clearTerminal path (an
 * absolute, home-anchored full rewrite) which wipes any artifact. The caller
 * must thread the nonce into the rendered output so the frame STRING changes —
 * log-update skips writes when the output is identical to its previous frame.
 */
export function useResizeRedraw(active: boolean, debounceMs = 120): number {
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onResize = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setNonce((n) => n + 1), debounceMs);
    };
    process.stdout.on("resize", onResize);
    return () => {
      if (timer) clearTimeout(timer);
      process.stdout.off("resize", onResize);
    };
  }, [active, debounceMs]);
  return nonce;
}
