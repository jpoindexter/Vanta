// Pure SGR mouse-escape parser.
//
// Terminals in SGR extended mouse mode (DEC private mode 1006) report mouse
// activity as `\x1b[<b;x;y` followed by `M` (press / motion) or `m` (release):
//   \x1b[<0;12;5M   left button pressed at column 12, row 5
//   \x1b[<0;12;5m   left button released at the same cell
//   \x1b[<35;12;5M  motion (no button) — the 32 bit marks a drag/move
//   \x1b[<64;12;5M  scroll up   (button code 64)
//   \x1b[<65;12;5M  scroll down (button code 65)
// Coordinates are 1-based in the wire format; we normalise to 0-based so they
// compose directly with a zero-origin region grid (see hit-test.ts).
//
// This module is the PARSE stage of the parse -> hit-test -> dispatch pipeline.
// Wiring it to a live terminal (writing the 1006 enable escape, reading bytes
// off real stdin) is the documented boundary handled elsewhere; this stays pure.

export type MouseButton = "left" | "middle" | "right" | "scroll-up" | "scroll-down" | "none";

export type MouseAction = "press" | "release" | "move";

export type MouseEvent = {
  button: MouseButton;
  action: MouseAction;
  /** 0-based column (terminal cell), normalised from the 1-based wire value. */
  x: number;
  /** 0-based row (terminal cell), normalised from the 1-based wire value. */
  y: number;
};

/** Bit 5 (32) of the SGR button byte marks pointer motion / drag. */
const MOTION_BIT = 32;
/** Low two bits of the SGR button byte select the physical button. */
const BUTTON_MASK = 0b11;
/** Button low-bits of 3 mean "no button" — bare motion (e.g. code 35 = 32+3). */
const NO_BUTTON_BITS = 0b11;
/** Scroll events use dedicated high button codes 64 (up) and 65 (down). */
const SCROLL_UP_CODE = 64;
const SCROLL_DOWN_CODE = 65;

const SGR_MOUSE_RE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/;

/**
 * Parse a single SGR mouse escape sequence into a normalised {@link MouseEvent}.
 * Returns `null` for any sequence that is not a well-formed SGR mouse report
 * (errors-as-values — never throws across the boundary).
 */
export function parseMouseEvent(seq: string): MouseEvent | null {
  const match = SGR_MOUSE_RE.exec(seq);
  if (!match) return null;

  const code = Number(match[1]);
  const col = Number(match[2]);
  const row = Number(match[3]);
  const final = match[4];
  if (final === undefined || !Number.isInteger(code) || col < 1 || row < 1) return null;

  return {
    button: buttonFromCode(code),
    action: actionFor(code, final),
    x: col - 1,
    y: row - 1,
  };
}

function buttonFromCode(code: number): MouseButton {
  if (code === SCROLL_UP_CODE) return "scroll-up";
  if (code === SCROLL_DOWN_CODE) return "scroll-down";
  // Bare motion with no held button carries button-bits 3 (e.g. code 35 = 32+3);
  // a held-button drag keeps the button's low bits (code 32 = 32+0 = left drag).
  if ((code & BUTTON_MASK) === NO_BUTTON_BITS) return "none";
  return PHYSICAL_BUTTONS[code & BUTTON_MASK] ?? "none";
}

const PHYSICAL_BUTTONS: Record<number, MouseButton> = {
  0: "left",
  1: "middle",
  2: "right",
};

function actionFor(code: number, final: string): MouseAction {
  // A scroll report is a discrete wheel tick, modelled as a press.
  if (code === SCROLL_UP_CODE || code === SCROLL_DOWN_CODE) return "press";
  if ((code & MOTION_BIT) !== 0) return "move";
  return final === "m" ? "release" : "press";
}
