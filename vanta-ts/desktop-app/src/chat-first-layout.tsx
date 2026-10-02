import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

type Pane = "sidebar" | "context";
const bounds = { sidebar: { minimum: 220, maximum: 360, initial: 260 }, context: { minimum: 300, maximum: 800, initial: 560 } };

export function paneWidth(pane: Pane, value: number): number {
  const { minimum, maximum, initial } = bounds[pane];
  return Number.isFinite(value) && value > 0 ? Math.max(minimum, Math.min(maximum, Math.round(value))) : initial;
}

function loadWidth(pane: Pane): number {
  try { return paneWidth(pane, Number(localStorage.getItem(`vanta.desktop.chat-width.${pane}`))); }
  catch { return bounds[pane].initial; }
}

export function useChatLayout() {
  const [sidebar, setSidebar] = useState(() => loadWidth("sidebar"));
  const [context, setContext] = useState(() => loadWidth("context"));
  const setWidth = (pane: Pane, value: number) => {
    const width = paneWidth(pane, value);
    (pane === "sidebar" ? setSidebar : setContext)(width);
  };
  useEffect(() => {
    // Delay persistence until the gesture settles, not one disk write per frame.
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem("vanta.desktop.chat-width.sidebar", String(sidebar));
        localStorage.setItem("vanta.desktop.chat-width.context", String(context));
      } catch { /* Geometry remains usable when storage is unavailable. */ }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [sidebar, context]);
  return { sidebar, context, setWidth, style: { "--chat-sidebar-width": `${sidebar}px`, "--chat-context-width": `${context}px` } as CSSProperties };
}

type Props = { pane: Pane; value: number; onChange: (pane: Pane, value: number) => void };

export function ChatPaneResize({ pane, value, onChange }: Props) {
  const drag = useRef<{ id: number; x: number; value: number } | null>(null);
  const direction = pane === "sidebar" ? 1 : -1;
  const update = (next: number) => onChange(pane, paneWidth(pane, next));
  return <div className={`chat-resize chat-resize-${pane}`} role="separator" aria-orientation="vertical"
    aria-label={`Resize ${pane}`} aria-valuemin={bounds[pane].minimum} aria-valuemax={bounds[pane].maximum}
    aria-valuenow={value} tabIndex={0} title="Drag or use arrow keys to resize. Home and End set the limits."
    onPointerDown={(event) => {
      drag.current = { id: event.pointerId, x: event.clientX, value };
      event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
    }} onPointerMove={(event) => {
      if (drag.current?.id === event.pointerId) update(drag.current.value + (event.clientX - drag.current.x) * direction);
    }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
    onLostPointerCapture={() => { drag.current = null; }} onKeyDown={(event) => {
      const next = resizedWidth(pane, value, event);
      if (next === undefined) return;
      event.preventDefault(); update(next);
    }} />;
}

export function resizedWidth(pane: Pane, value: number, key: { key: string; shiftKey: boolean }): number | undefined {
  const direction = pane === "sidebar" ? 1 : -1;
  if (key.key === "Home") return bounds[pane].minimum;
  if (key.key === "End") return bounds[pane].maximum;
  if (!["ArrowLeft", "ArrowRight"].includes(key.key)) return undefined;
  return paneWidth(pane, value + (key.key === "ArrowRight" ? 1 : -1) * direction * (key.shiftKey ? 32 : 16));
}
