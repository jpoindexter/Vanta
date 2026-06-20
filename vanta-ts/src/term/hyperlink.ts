// OSC-8 clickable hyperlinks — render a file path or URL as a terminal
// hyperlink (clickable in iTerm2 / WezTerm / Kitty / modern terminals) with a
// visible label over a hidden target, else plain text. Pure (env in, string
// out); the only side effect is the escape bytes in the returned string.
//
// Sequence:  ESC ] 8 ; ; <url> ESC \  <label>  ESC ] 8 ; ; ESC \   (ST = ESC \).
// Spec: https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda
//
// SECURITY: the url goes INSIDE the escape, so a hostile path/URL with an
// embedded ESC / BEL / ST could otherwise inject extra OSC-8 openers/closers
// and break out of the sequence. `sanitizeLinkUrl` strips those bytes first, so
// the emitted sequence always has exactly one opener and one closer.
//
// Distinct from the sibling `osc8.ts` (which interpolates the url RAW): every
// builder here sanitizes the target before wrapping. Output/transcript render
// points (`ui/transcript.tsx`, `ui/linked-text.tsx`) should route through
// `linkOr` / `fileLink` so the displayed link can never break the stream.

import { isAbsolute, resolve } from "node:path";

const OSC = "\x1b]8;;";
const ST = "\x1b\\";

/**
 * Strip every byte that could break out of an OSC-8 sequence: C0/C1 control
 * chars (incl. ESC `\x1b` and BEL `\x07`), DEL, and — defensively — any literal
 * `;` is left intact (it's only structural in the leading `]8;;`, which we add
 * ourselves) while the control strip removes the ESC half of any embedded ST
 * (`ESC \`). Returns "" for an empty or fully-stripped url. Pure.
 */
export function sanitizeLinkUrl(url: string): string {
  if (typeof url !== "string" || url.length === 0) return "";
  let out = "";
  for (const ch of url) {
    const code = ch.codePointAt(0) ?? 0;
    // C0 controls (0x00–0x1F incl. ESC 0x1B / BEL 0x07 / TAB / newlines),
    // DEL (0x7F), and C1 controls (0x80–0x9F) are all dropped.
    if (code <= 0x1f || code === 0x7f || (code >= 0x80 && code <= 0x9f)) continue;
    out += ch;
  }
  return out;
}

/**
 * Wrap `url` + `label` in the exact OSC-8 form
 * `ESC]8;;<url>ESC\<label>ESC]8;;ESC\`. The `label` is what's displayed; `url`
 * is the (already-sanitized-by-callers) click target. Pure — no enable/empty
 * checks here; see `linkOr` for the guarded surface. The url is sanitized
 * defensively so a direct call can't inject either. Pure.
 */
export function osc8Link(url: string, label: string): string {
  const safe = sanitizeLinkUrl(url);
  return `${OSC}${safe}${ST}${label}${OSC}${ST}`;
}

/**
 * Whether OSC-8 hyperlinks should be emitted. Opt-in by default (many terminals
 * render the escape as garbage): true only when `VANTA_HYPERLINKS` is 1/true, or
 * a known-good `TERM_PROGRAM` is set. `VANTA_HYPERLINKS=0|false` forces off even
 * on a known terminal. Pure. */
export function hyperlinksEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const override = (env.VANTA_HYPERLINKS ?? "").toLowerCase();
  if (override === "1" || override === "true") return true;
  if (override === "0" || override === "false") return false;
  const program = (env.TERM_PROGRAM ?? "").toLowerCase();
  return /iterm|wezterm|vscode|ghostty/.test(program);
}

/**
 * The OSC-8 link for `url` + `label` when hyperlinks are enabled AND the
 * sanitized url is non-empty; otherwise the plain `label` (current behavior).
 * This is the guarded surface output/transcript rendering should call. Pure. */
export function linkOr(url: string, label: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!hyperlinksEnabled(env)) return label;
  const safe = sanitizeLinkUrl(url);
  if (safe.length === 0) return label;
  return osc8Link(safe, label);
}

/**
 * A `file://` hyperlink for a local path (label = the path as given). Relative
 * paths resolve against `cwd`. Disabled/unsupported → the plain path. Pure. */
export function fileLink(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string {
  if (typeof path !== "string" || path.length === 0) return "";
  const abs = isAbsolute(path) ? path : resolve(cwd, path);
  return linkOr(`file://${abs}`, path, env);
}
