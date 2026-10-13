/** Matches the CSS breakpoint where the sidebar becomes an overlay that hides the conversation. */
export const NARROW_MAX_PX = 760;

/** True when the window opens narrow enough that an open sidebar would hide the chat and composer. */
export function startsNarrow(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.(`(max-width: ${NARROW_MAX_PX}px)`).matches === true;
}
