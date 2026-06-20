// Terminal window/tab title — set a compact "Vanta — <session/active task>" so
// the operator can pick the session out of a row of terminal tabs. Pure (parts
// in, string out; env+isTTY in, boolean out); the only side effect lives in
// setTerminalTitle, which writes the OSC escape through an injected writer.
//
// Sequence: ESC ] 0 ; <title> BEL  (OSC 0 sets both icon name and window title).
// A task/goal name must never inject its own escape — buildTerminalTitle strips
// ESC/BEL/control chars so the title is always a single safe line.

const OSC = "\x1b]0;";
const BEL = "\x07";
const BRAND = "Vanta";
const SEP = " — "; // em dash, matching the rest of the TUI chrome
const MAX_TITLE = 80;

// Control chars (incl. ESC \x1b / BEL \x07 / newlines) — stripped so a task name
// can never break out of the title sequence (no escape injection).
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");
const WHITESPACE_RUN = /\s+/g;

/** Strip control chars, then collapse internal whitespace runs to single spaces. */
function sanitizePart(part: string): string {
  return part.replace(CONTROL_CHARS, " ").replace(WHITESPACE_RUN, " ").trim();
}

/** Build the compact title string from ordered parts (e.g. the active task).
 *  Empty/whitespace-only parts drop out; with no usable part the brand stands
 *  alone. Truncated to a sane max (ellipsis) so long goal text stays one line. */
export function buildTerminalTitle(parts: readonly string[]): string {
  const clean = parts.map(sanitizePart).filter((p) => p.length > 0);
  if (clean.length === 0) return BRAND;
  const full = `${BRAND}${SEP}${clean.join(SEP)}`;
  if (full.length <= MAX_TITLE) return full;
  return `${full.slice(0, MAX_TITLE - 1).trimEnd()}…`;
}

/** Wrap an (already-safe) title in the OSC-0 set-title escape. */
export function titleSequence(title: string): string {
  return `${OSC}${title}${BEL}`;
}

/** Whether the title should be set for this environment: only on a TTY, and not
 *  disabled via VANTA_TERMINAL_TITLE=0/false. Default on for a TTY. */
export function titleEnabled(
  env: NodeJS.ProcessEnv = process.env,
  isTTY: boolean = Boolean(process.stdout?.isTTY),
): boolean {
  if (!isTTY) return false;
  const flag = (env.VANTA_TERMINAL_TITLE ?? "").toLowerCase();
  if (flag === "0" || flag === "false") return false;
  return true;
}

type TitleDeps = {
  write: (s: string) => void;
  env?: NodeJS.ProcessEnv;
  isTTY?: boolean;
};

/** Best-effort: write the title escape when enabled, else no-op. Never throws —
 *  setting a window title must never be able to break a session. */
export function setTerminalTitle(parts: readonly string[], deps: TitleDeps): void {
  try {
    const env = deps.env ?? process.env;
    const isTTY = deps.isTTY ?? Boolean(process.stdout?.isTTY);
    if (!titleEnabled(env, isTTY)) return;
    deps.write(titleSequence(buildTerminalTitle(parts)));
  } catch {
    // intentionally swallowed — a failed title write is never fatal
  }
}
