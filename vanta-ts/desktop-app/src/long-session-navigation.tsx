import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Message } from "./types.js";
import { patchSessionView, readSessionView } from "./session-view-state.js";

const AT_BOTTOM_PX = 32;
const MAX_PROMPT_MARKERS = 32;
const VIEW_STATE_DELAY_MS = 120;

export type PromptMarker = { index: number; label: string };

export function isNearBottom(scrollHeight: number, scrollTop: number, clientHeight: number): boolean {
  return scrollHeight - scrollTop - clientHeight <= AT_BOTTOM_PX;
}

export function selectPromptMarkers(messages: Message[], maximum = MAX_PROMPT_MARKERS): PromptMarker[] {
  const prompts = messages.flatMap((message, index): PromptMarker[] => {
    if (message.role !== "user") return [];
    const label = (message.content ?? "").trim().replace(/\s+/g, " ");
    return label ? [{ index, label }] : [];
  });
  if (prompts.length <= maximum) return prompts;
  return Array.from({ length: maximum }, (_, slot) => prompts[Math.round(slot * (prompts.length - 1) / (maximum - 1))]!);
}

export function preferredScrollBehavior(): ScrollBehavior {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

type ReadingAnchor = { index: number; offset: number };

export function useLongSessionNavigation(input: { sessionId?: string; contentVersion: string; getReadingAnchor?: () => ReadingAnchor | null; restoreReadingAnchor?: (anchor: ReadingAnchor) => boolean }) {
  const sessionId = input.sessionId || "new-session";
  const scrollerRef = useRef<HTMLElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const persistTimer = useRef<number | null>(null);
  const pinFrame = useRef<number | null>(null);
  const userHoldUntil = useRef(0);
  const [detached, setDetached] = useState(false);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || typeof window === "undefined") return;
    const restored = readSessionView(window.localStorage, sessionId);
    let lastScrollTop = restored?.scrollTop ?? 0;
    let lastAnchor = restored?.anchorIndex === undefined ? null : { index: restored.anchorIndex, offset: restored.anchorOffset ?? 0 };
    const restoreAnchorUntil = lastAnchor && !restored?.stickToBottom ? Date.now() + 1000 : 0;
    let pendingRestoreTop = restored && !restored.stickToBottom ? restored.scrollTop : null;
    stickRef.current = restored?.stickToBottom ?? true;
    if (pendingRestoreTop !== null) userHoldUntil.current = Date.now() + 1000;
    setDetached(!stickRef.current);

    const persist = () => {
      lastScrollTop = scroller.scrollTop;
      if (Date.now() >= restoreAnchorUntil) lastAnchor = input.getReadingAnchor?.() ?? lastAnchor;
      if (persistTimer.current !== null) window.clearTimeout(persistTimer.current);
      persistTimer.current = window.setTimeout(() => {
        patchSessionView(window.localStorage, sessionId, { scrollTop: lastScrollTop, stickToBottom: stickRef.current, ...(lastAnchor ? { anchorIndex: lastAnchor.index, anchorOffset: lastAnchor.offset } : {}) });
      }, VIEW_STATE_DELAY_MS);
    };
    const setStick = (next: boolean) => {
      if (stickRef.current === next) return;
      stickRef.current = next;
      setDetached(!next);
      persist();
    };
    const detach = () => {
      userHoldUntil.current = Date.now() + 500;
      setStick(false);
    };
    const onScroll = () => {
      if (pendingRestoreTop !== null) {
        restore();
        if (pendingRestoreTop !== null) return;
      }
      if (isNearBottom(scroller.scrollHeight, scroller.scrollTop, scroller.clientHeight)) {
        if (Date.now() >= userHoldUntil.current) setStick(true);
      } else if (stickRef.current) {
        schedulePin();
      }
      persist();
    };
    const onWheel = (event: WheelEvent) => { if (event.deltaY < 0) detach(); };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (["ArrowUp", "PageUp", "Home"].includes(event.key) || (event.key === " " && event.shiftKey)) detach();
    };
    let touchY: number | null = null;
    const onTouchStart = (event: TouchEvent) => { touchY = event.touches[0]?.clientY ?? null; };
    const onTouchMove = (event: TouchEvent) => {
      const nextY = event.touches[0]?.clientY ?? null;
      if (touchY !== null && nextY !== null && nextY > touchY + 2) detach();
      touchY = nextY;
    };
    const restore = () => {
      if (stickRef.current) scroller.scrollTop = scroller.scrollHeight;
      else {
        if (lastAnchor && input.restoreReadingAnchor?.(lastAnchor)) pendingRestoreTop = null;
        const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        const target = pendingRestoreTop ?? restored?.scrollTop ?? 0;
        if (pendingRestoreTop !== null) {
          scroller.scrollTop = Math.min(target, maximum);
          if (maximum >= target) pendingRestoreTop = null;
        }
      }
      lastScrollTop = scroller.scrollTop;
    };
    const schedulePin = () => {
      if (!stickRef.current || pinFrame.current !== null) return;
      pinFrame.current = window.requestAnimationFrame(() => {
        pinFrame.current = null;
        if (stickRef.current) scroller.scrollTop = scroller.scrollHeight;
      });
    };

    scroller.addEventListener("scroll", onScroll, { passive: true });
    scroller.addEventListener("wheel", onWheel, { passive: true });
    scroller.addEventListener("keydown", onKeyDown);
    scroller.addEventListener("touchstart", onTouchStart, { passive: true });
    scroller.addEventListener("touchmove", onTouchMove, { passive: true });
    const list = bottomRef.current?.parentElement ?? scroller;
    const onLayout = () => { if (pendingRestoreTop !== null) restore(); else schedulePin(); };
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onLayout);
    resizeObserver?.observe(scroller);
    if (list !== scroller) resizeObserver?.observe(list);
    const mutationObserver = typeof MutationObserver === "undefined" ? null : new MutationObserver(onLayout);
    mutationObserver?.observe(list, { childList: true, subtree: true });
    const bottomObserver = typeof IntersectionObserver === "undefined" || !bottomRef.current ? null : new IntersectionObserver(
      ([entry]) => { if (!entry?.isIntersecting) schedulePin(); },
      { root: scroller, threshold: 1 },
    );
    if (bottomRef.current) bottomObserver?.observe(bottomRef.current);
    window.requestAnimationFrame(restore);
    const restoreTimers = restoreAnchorUntil ? [80, 220, 480, 820].map((milliseconds) => window.setTimeout(restore, milliseconds)) : [];

    return () => {
      patchSessionView(window.localStorage, sessionId, { scrollTop: lastScrollTop, stickToBottom: stickRef.current, ...(lastAnchor ? { anchorIndex: lastAnchor.index, anchorOffset: lastAnchor.offset } : {}) });
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("keydown", onKeyDown);
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchmove", onTouchMove);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      bottomObserver?.disconnect();
      restoreTimers.forEach((timer) => window.clearTimeout(timer));
      if (persistTimer.current !== null) window.clearTimeout(persistTimer.current);
      if (pinFrame.current !== null) window.cancelAnimationFrame(pinFrame.current);
    };
  }, [sessionId]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !stickRef.current || typeof window === "undefined") return;
    if (pinFrame.current !== null) window.cancelAnimationFrame(pinFrame.current);
    pinFrame.current = window.requestAnimationFrame(() => {
      pinFrame.current = null;
      if (stickRef.current) scroller.scrollTop = scroller.scrollHeight;
    });
  }, [input.contentVersion]);

  function jumpTo(index: number) {
    const scroller = scrollerRef.current;
    const target = scroller?.querySelector<HTMLElement>(`[data-turn-index="${index}"]`);
    if (!target) return;
    stickRef.current = false;
    userHoldUntil.current = Date.now() + 500;
    setDetached(true);
    target.scrollIntoView({ block: "center", behavior: preferredScrollBehavior() });
    if (typeof window !== "undefined") patchSessionView(window.localStorage, sessionId, { stickToBottom: false });
  }

  function detach() {
    const scroller = scrollerRef.current;
    stickRef.current = false;
    userHoldUntil.current = Date.now() + 500;
    setDetached(true);
    if (scroller && typeof window !== "undefined") patchSessionView(window.localStorage, sessionId, { scrollTop: scroller.scrollTop, stickToBottom: false });
  }

  function goLatest() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    stickRef.current = true;
    userHoldUntil.current = 0;
    setDetached(false);
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: preferredScrollBehavior() });
    if (typeof window !== "undefined") patchSessionView(window.localStorage, sessionId, { scrollTop: scroller.scrollHeight, stickToBottom: true });
  }

  return { scrollerRef, bottomRef, detached, detach, jumpTo, goLatest };
}

export function PromptMarkers(props: { messages: Message[]; onJump: (index: number) => void }) {
  const markers = useMemo(() => selectPromptMarkers(props.messages), [props.messages]);
  if (!markers.length) return null;
  return (
    <nav className="prompt-markers" aria-label="Session prompts">
      {markers.map((marker, slot) => (
        <button key={`${marker.index}-${slot}`} type="button" aria-label={`Jump to prompt: ${marker.label}`} title={marker.label} data-current={slot === markers.length - 1 || undefined} onClick={() => props.onJump(marker.index)}><span /></button>
      ))}
    </nav>
  );
}

export function LatestButton(props: { visible: boolean; streaming: boolean; onClick: () => void }) {
  if (!props.visible) return null;
  return <button className="latest-message-button" type="button" aria-label="Scroll to latest message" onClick={props.onClick}>{props.streaming ? "New messages" : "Latest"}<ChevronDown size={14} /></button>;
}
