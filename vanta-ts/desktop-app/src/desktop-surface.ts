import { useEffect, useRef, useState } from "react";
import type { ChatFirstState } from "./chat-first-state.js";

export type DesktopSurfaceMode = "full" | "mini";
type Presentation = Pick<ChatFirstState, "view" | "sidebar" | "inspector">;
type Bridge = {
  readSurfaceMode: () => Promise<DesktopSurfaceMode>;
  setSurfaceMode: (mode: DesktopSurfaceMode) => Promise<DesktopSurfaceMode>;
  onSurfaceMode: (callback: (mode: DesktopSurfaceMode) => void) => () => void;
  reportSurfacePhase: (phase: string) => void;
};

function surfaceBridge(): Bridge | undefined {
  const bridge = (window as Window & { vantaDesktop?: Partial<Bridge> }).vantaDesktop;
  return bridge?.setSurfaceMode && bridge.readSurfaceMode && bridge.onSurfaceMode && bridge.reportSurfacePhase
    ? bridge as Bridge : undefined;
}

export function surfacePresentation(mode: DesktopSurfaceMode, saved: Presentation): Presentation {
  return mode === "mini" ? { view: "work", sidebar: false, inspector: false } : saved;
}

/** Presentation state is saved separately; conversation state is never replaced. */
export function useDesktopSurface(state: ChatFirstState) {
  const [mode, setMode] = useState<DesktopSurfaceMode>("full");
  const current = useRef(state);
  current.current = state;
  useEffect(() => {
    const bridge = surfaceBridge();
    if (!bridge) return;
    let saved: Presentation | undefined;
    let disposed = false;
    let observedEvent = false;
    const apply = (next: DesktopSurfaceMode) => {
      if (disposed || (next !== "full" && next !== "mini")) return;
      const live = current.current;
      if (next === "mini") saved ??= { view: live.view, sidebar: live.sidebar, inspector: live.inspector };
      if (saved) {
        const presentation = surfacePresentation(next, saved);
        live.setView(presentation.view); live.setSidebar(presentation.sidebar); live.setInspector(presentation.inspector);
      }
      if (next === "full") saved = undefined;
      setMode(next);
    };
    const unsubscribe = bridge.onSurfaceMode((next) => { observedEvent = true; apply(next); });
    void bridge.readSurfaceMode().then((next) => { if (!observedEvent) apply(next); }).catch(() => {});
    return () => { disposed = true; unsubscribe(); };
  }, []);
  const phase = state.data.phase !== "ready" ? "connecting" : state.approval.approval ? "needs-you" : state.convo.busy ? "working" : "ready";
  useEffect(() => { surfaceBridge()?.reportSurfacePhase(phase); }, [phase]);
  return { mode, available: Boolean(surfaceBridge()), toggle: () => {
    void surfaceBridge()?.setSurfaceMode(mode === "mini" ? "full" : "mini")
      .catch((error: unknown) => state.setError(error instanceof Error ? error.message : String(error)));
  } };
}
