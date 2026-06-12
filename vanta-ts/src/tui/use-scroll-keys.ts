import { useInput, type ScrollBoxHandle } from "ink";
import type { MutableRefObject } from "react";
import { useKeybinding } from "./keybinding/use-keybinding.js";

// Scroll keys for the ScrollBox transcript. The vendored ink fork's keypress
// parser turns terminal mouse reports into wheelUp/wheelDown key events
// (AlternateScreen mouseTracking="wheel" enables the reporting), so trackpad,
// wheel, and keyboard all land here and move the same line-based viewport.
// stickyScroll pins to bottom; any manual scroll unpins until scrollToBottom.
// Keyboard chords come from the registry (transcript.scroll*); the wheel is a
// mouse event, not a rebindable chord, so it stays inline.

const WHEEL_LINES = 3;

export function useScrollKeys(ref: MutableRefObject<ScrollBoxHandle | null>): void {
  const half = (): number => {
    const s = ref.current;
    return s ? Math.max(1, Math.floor(s.getViewportHeight() / 2)) : 1;
  };
  // Wheel/trackpad — continuous mouse reporting, not a registry chord.
  useInput((_in, key) => {
    const s = ref.current;
    if (!s) return;
    if (key.wheelUp) s.scrollBy(-WHEEL_LINES);
    else if (key.wheelDown) s.scrollBy(WHEEL_LINES);
  });
  useKeybinding("transcript.scrollUp", () => ref.current?.scrollBy(-half()));
  useKeybinding("transcript.scrollDown", () => ref.current?.scrollBy(half()));
  useKeybinding("transcript.scrollLineUp", () => ref.current?.scrollBy(-1));
  useKeybinding("transcript.scrollLineDown", () => ref.current?.scrollBy(1));
  useKeybinding("transcript.scrollToBottom", () => ref.current?.scrollToBottom());
}
