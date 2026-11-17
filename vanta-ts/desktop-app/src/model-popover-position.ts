import { useLayoutEffect, useRef } from "react";

type Size = { width: number; height: number };
type Anchor = { left: number; right: number; top: number; bottom: number };
type PositionInput = { anchor: Anchor; menu: Size; viewport: Size };

export function positionModelPopover({ anchor, menu, viewport }: PositionInput) {
  const edge = 12, gap = 8;
  const maxWidth = Math.max(0, viewport.width - edge * 2);
  const width = Math.min(menu.width, maxWidth);
  const above = Math.max(0, anchor.top - gap - edge);
  const below = Math.max(0, viewport.height - edge - anchor.bottom - gap);
  const opensAbove = menu.height <= above || above >= below;
  const maxHeight = Math.max(1, Math.min(560, viewport.height - edge * 2, opensAbove ? above : below));
  const height = Math.min(menu.height, maxHeight);
  const desiredTop = opensAbove ? anchor.top - gap - height : anchor.bottom + gap;
  return {
    left: Math.max(edge, Math.min(anchor.right - width, viewport.width - edge - width)),
    top: Math.max(edge, Math.min(desiredTop, viewport.height - edge - height)),
    maxWidth,
    maxHeight,
  };
}

export function useModelPopoverPosition() {
  const panelRef = useRef<HTMLElement>(null);
  const opener = useRef(typeof document === "undefined" ? null : document.activeElement);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const root = panel.closest(".chat-first-shell") ?? document.documentElement;
    const trigger = opener.current?.matches(".model-button") && opener.current.isConnected
      ? opener.current : root.querySelector(".composer .model-button");
    if (!trigger) return;
    const update = () => {
      const position = positionModelPopover({
        anchor: trigger.getBoundingClientRect(),
        menu: { width: panel.offsetWidth, height: Math.max(panel.offsetHeight, panel.scrollHeight + 2) },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      });
      Object.assign(panel.style, {
        position: "fixed", right: "auto", bottom: "auto",
        left: `${position.left}px`, top: `${position.top}px`,
        maxWidth: `${position.maxWidth}px`, maxHeight: `${position.maxHeight}px`,
      });
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    for (const element of [panel, trigger, trigger.closest(".composer"), trigger.closest(".chat-main"), root]) {
      if (element) observer?.observe(element);
    }
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, []);
  return panelRef;
}
