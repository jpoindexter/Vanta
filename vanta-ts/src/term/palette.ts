// Vanta's TUI accent palette, aligned to the brand book (BRAND-BOOK 3.4 "Color —
// Confirmed"): three colors, no drift. Vanta Black is the terminal field, Bone is
// text, and Signal Violet is reserved for state that is active, selected, focused,
// live, or a machine attention point.
//
// The TUI stays ~85% monochrome (terminal-default fg); these accents color SYMBOLS
// (markers/glyphs), never whole lines, so one role reads per row. That matches the
// book's 82% Black / 16% Bone / 2% Violet target — violet is rare on purpose.
// Plain constants — NOT a theme system (no provider, no switching, no terminal
// detection). Text and the VANTA wordmark stay the terminal default.

/** Signal Violet. Selection, focus, cursor, live state, small rule. */
export const VIOLET = "#7c3aed";
/** Bone / Ink. Primary text on black. */
export const BONE = "#f4efe3";

export const FOCUS = VIOLET; // prompt chevron, cursor, active tool, selection
export const ACTIVITY = VIOLET; // thinking / running / paused / approval-needed — a live state
export const GOAL = BONE; // goal/task lines are text; the book bars violet as body text on black
export const HEALTH = BONE; // success reads from the ✓ glyph, not a hue

// The one sanctioned deviation. The palette has no danger color, and the book's own
// rule — "do not use color as the sole indicator of state" — assumes colour REINFORCES
// a glyph rather than replacing it. Dropping red from destructive-risk and failed
// verification would remove that reinforcement where the cost of missing it is highest,
// so a single functional red stays. It is never used decoratively.
export const RISK = "#d64550"; // blocked, destructive risk, failed verification
