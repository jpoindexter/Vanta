import { useInput, type ScrollBoxHandle } from "ink";
import type { MutableRefObject } from "react";

// Scroll keys for the ScrollBox transcript. The vendored ink fork's keypress
// parser turns terminal mouse reports into wheelUp/wheelDown key events
// (AlternateScreen mouseTracking="wheel" enables the reporting), so trackpad,
// wheel, and keyboard all land here and move the same line-based viewport.
// stickyScroll pins to bottom; any manual scroll unpins until scrollToBottom.

const WHEEL_LINES = 3;

export function useScrollKeys(ref: MutableRefObject<ScrollBoxHandle | null>): void {
  useInput((_in, key) => {
    const s = ref.current;
    if (!s) return;
    const half = Math.max(1, Math.floor(s.getViewportHeight() / 2));
    if (key.wheelUp) s.scrollBy(-WHEEL_LINES);
    else if (key.wheelDown) s.scrollBy(WHEEL_LINES);
    else if (key.pageUp) s.scrollBy(-half);
    else if (key.pageDown) s.scrollBy(half);
    else if (key.shift && key.upArrow) s.scrollBy(-1);
    else if (key.shift && key.downArrow) s.scrollBy(1);
    else if (key.ctrl && key.end) s.scrollToBottom();
  });
}
