// OSC-8 terminal hyperlinks — wrap a label so a supporting terminal makes it
// clickable, else emit the label unchanged. Pure (env in, string out); the only
// caller-visible side effect is the escape sequence in the returned string.
//
// Sequence: ESC ] 8 ; ; URI ST  <label>  ESC ] 8 ; ; ST  (ST = ESC \).
// Spec: https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda

const OSC = "\x1b]8;;";
const ST = "\x1b\\";

/** Terminals known to render OSC-8 hyperlinks. Detection is best-effort and
 *  conservative: unknown terminals fall back to plain text (still readable). */
function isKnownHyperlinkTerm(env: NodeJS.ProcessEnv): boolean {
  const program = (env.TERM_PROGRAM ?? "").toLowerCase();
  if (/iterm|wezterm|vscode|hyper|ghostty|tabby|rio/.test(program)) return true;
  if (env.WT_SESSION) return true; // Windows Terminal
  if (env.KITTY_WINDOW_ID || (env.TERM ?? "").includes("kitty")) return true;
  if (env.VTE_VERSION && Number(env.VTE_VERSION) >= 5000) return true; // GNOME/modern VTE
  if (env.KONSOLE_VERSION) return true;
  return false;
}

/** Whether OSC-8 hyperlinks should be emitted for this environment. Honors an
 *  explicit `VANTA_HYPERLINKS` override (1/true on, 0/false off), then a TTY +
 *  known-terminal check. Non-TTY (piped/captured) never emits the escape. */
export function supportsHyperlinks(
  env: NodeJS.ProcessEnv = process.env,
  isTTY: boolean = Boolean(process.stdout?.isTTY),
): boolean {
  const override = (env.VANTA_HYPERLINKS ?? "").toLowerCase();
  if (override === "1" || override === "true") return true;
  if (override === "0" || override === "false") return false;
  if (!isTTY) return false;
  return isKnownHyperlinkTerm(env);
}

/** Wrap `label` as an OSC-8 hyperlink to `url` when `enabled`, else return the
 *  plain label. An empty link target returns the label unchanged. */
export function osc8(url: string, label: string, enabled: boolean): string {
  if (!enabled || !url) return label;
  return `${OSC}${url}${ST}${label}${OSC}${ST}`;
}
