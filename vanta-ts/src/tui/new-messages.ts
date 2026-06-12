import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { ScrollBoxHandle } from "ink";

// The "N new messages" pill: when the user has scrolled up away from the tail,
// new transcript entries are counted so a pill can invite them back down. Pure
// helpers + a polling hook (the ScrollBox doesn't emit scroll events to us, so
// we sample its position on a slow interval).

const BOTTOM_EPSILON = 1;
const POLL_MS = 250;

/** True when the viewport is pinned at (or within a line of) the bottom. */
export function isAtBottom(scrollTop: number, scrollHeight: number, viewportHeight: number): boolean {
  return scrollTop + viewportHeight >= scrollHeight - BOTTOM_EPSILON;
}

/** Unseen entries since the last time the viewport was at the bottom. */
export function unseenCount(total: number, baseline: number): number {
  return Math.max(0, total - baseline);
}

/**
 * Track how many transcript entries arrived while the user was scrolled up. At
 * the bottom the baseline tracks the live count (pill hidden); scrolled away,
 * the pill counts new arrivals until the user returns to the tail.
 */
export function useNewMessages(scrollRef: MutableRefObject<ScrollBoxHandle | null>, entryCount: number): number {
  const [unseen, setUnseen] = useState(0);
  const baseline = useRef(0);
  const countRef = useRef(entryCount);
  countRef.current = entryCount;
  useEffect(() => {
    const id = setInterval(() => {
      const s = scrollRef.current;
      if (!s) return;
      if (isAtBottom(s.getScrollTop(), s.getScrollHeight(), s.getViewportHeight())) {
        baseline.current = countRef.current;
        setUnseen(0);
      } else {
        setUnseen(unseenCount(countRef.current, baseline.current));
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [scrollRef]);
  return unseen;
}
