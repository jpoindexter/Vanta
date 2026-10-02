import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { chatTitle } from "./chat-first-navigation.js";
import type { Session } from "./types.js";

export function ChatPreviewDetails({ session }: { session: Session }) {
  return <div className="chat-preview-details"><strong>{chatTitle(session)}</strong>
    <span>{session.projectId ? `Project ID: ${session.projectId}` : "Project not recorded"}</span>
    <span>{session.archived ? "Archived chat" : "Saved chat"} · {session.turns} turns</span>
    <span>Updated <time dateTime={session.updated}>{session.updated.slice(0, 10)}</time></span>
  </div>;
}

export function useChatPreview(disabled: boolean) {
  const row = useRef<HTMLLIElement>(null), card = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const held = useRef({ hover: false, focus: false });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clear = () => clearTimeout(timer.current);
  const dismiss = () => { clear(); setVisible(false); };
  const begin = (kind: "hover" | "focus") => {
    held.current[kind] = true; clear();
    if (disabled || window.innerWidth <= 760) return;
    if (kind === "focus") setVisible(true);
    else timer.current = setTimeout(() => setVisible(true), 500);
  };
  const end = (kind: "hover" | "focus") => {
    held.current[kind] = false; clear();
    if (!held.current.hover && !held.current.focus) setVisible(false);
  };
  useEffect(() => { if (disabled) dismiss(); }, [disabled]);
  useEffect(() => clear, []);
  usePreviewPosition(row, card, visible && !disabled, dismiss);
  usePreviewEscape(visible && !disabled, dismiss);
  return { row, card, visible: visible && !disabled, dismiss,
    onPointerEnter: (event: React.PointerEvent) => { if (event.pointerType !== "touch") begin("hover"); },
    onPointerLeave: () => end("hover"),
    onFocus: (event: React.FocusEvent<HTMLLIElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) begin("focus");
    },
    onBlur: (event: React.FocusEvent<HTMLLIElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) end("focus");
    },
  };
}

function usePreviewEscape(visible: boolean, dismiss: () => void) {
  useEffect(() => {
    if (!visible) return;
    const escape = (event: KeyboardEvent) => handlePreviewEscape(event, dismiss);
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [visible, dismiss]);
}

export function handlePreviewEscape(event: KeyboardEvent, dismiss: () => void, documentRef: Pick<Document, "querySelector"> = document) {
  if (event.key !== "Escape") return;
  // The shell contains focus for every dialog, including compact popovers without
  // aria-modal. A lingering background preview must not consume their Escape.
  if (documentRef.querySelector('.chat-first-shell [role="dialog"]')) { dismiss(); return; }
  event.stopPropagation(); event.preventDefault(); dismiss();
}

function usePreviewPosition(row: RefObject<HTMLLIElement | null>, card: RefObject<HTMLDivElement | null>, visible: boolean, dismiss: () => void) {
  useLayoutEffect(() => {
    if (!visible || !row.current || !card.current) return;
    const update = () => {
      if (window.innerWidth <= 760) { dismiss(); return; }
      const anchor = row.current!.getBoundingClientRect(), panel = card.current!;
      panel.style.left = `${Math.max(8, Math.min(anchor.right, innerWidth - panel.offsetWidth - 8))}px`;
      panel.style.top = `${Math.max(8, Math.min(anchor.top, innerHeight - panel.offsetHeight - 8))}px`;
    };
    update();
    const observer = new ResizeObserver(update); observer.observe(row.current);
    window.addEventListener("resize", update); window.addEventListener("scroll", update, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [row, card, visible, dismiss]);
}
