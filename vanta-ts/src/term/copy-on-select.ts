// copy-on-select — detect the current terminal and generate the exact steps to turn
// on "copy on select" (selecting text auto-copies it to the clipboard, iTerm2-style).
//
// Vanta's TUI deliberately uses NATIVE terminal selection (inline <Static>, NO
// mouse capture — see the rebuild notes), so copy-on-select is a TERMINAL setting,
// not something Vanta can render or intercept. This module is therefore a HELP-TEXT
// generator only: it detects the terminal and prints the real enable steps. It never
// touches the terminal's config and never captures the mouse to do the copy itself.
//
// Be accurate: these are real settings. iTerm2 has "Copy to pasteboard on selection";
// Kitty has `copy_on_select`; Windows Terminal has `copyOnSelect`; WezTerm and GNOME
// copy-on-select on by default; Apple Terminal has no built-in setting.

/** Terminals we ship copy-on-select instructions for; `unknown` falls back to a generic note. */
export type TerminalKind =
  | "iterm2"
  | "apple-terminal"
  | "wezterm"
  | "kitty"
  | "gnome"
  | "windows-terminal"
  | "unknown";

const isWezterm = (env: NodeJS.ProcessEnv, program: string): boolean =>
  program.includes("wezterm") || Boolean(env.WEZTERM_PANE);

const isKitty = (env: NodeJS.ProcessEnv): boolean =>
  Boolean(env.KITTY_WINDOW_ID) || (env.TERM ?? "").includes("kitty");

// GNOME Terminal (and other modern VTE terminals) export VTE_VERSION.
const isModernVte = (env: NodeJS.ProcessEnv): boolean =>
  Boolean(env.VTE_VERSION) && Number(env.VTE_VERSION) >= 5000;

/** Pure terminal detection from the environment, mirroring `osc8.ts isKnownHyperlinkTerm`'s
 *  env signatures. Conservative: an unrecognized terminal returns `unknown` so the caller
 *  prints the generic note. Order matters — more specific signatures win first. */
export function detectTerminal(env: NodeJS.ProcessEnv): TerminalKind {
  const program = (env.TERM_PROGRAM ?? "").toLowerCase();
  if (program.includes("iterm")) return "iterm2";
  if (program.includes("apple_terminal")) return "apple-terminal";
  if (isWezterm(env, program)) return "wezterm";
  if (env.WT_SESSION) return "windows-terminal";
  if (isKitty(env)) return "kitty";
  if (isModernVte(env)) return "gnome";
  return "unknown";
}

/** Human label for each detected terminal (used in the printed header). */
export function terminalLabel(kind: TerminalKind): string {
  switch (kind) {
    case "iterm2":
      return "iTerm2";
    case "apple-terminal":
      return "Apple Terminal";
    case "wezterm":
      return "WezTerm";
    case "kitty":
      return "Kitty";
    case "gnome":
      return "GNOME Terminal";
    case "windows-terminal":
      return "Windows Terminal";
    case "unknown":
      return "your terminal";
  }
}

const ITERM2 = [
  "  iTerm2 — turn on copy-on-select:",
  "    1. Settings (⌘,) → General → Selection.",
  "    2. Tick “Copy to pasteboard on selection”.",
  "    Selecting text now auto-copies it to the clipboard (no ⌘C needed).",
].join("\n");

const APPLE_TERMINAL = [
  "  Apple Terminal — no built-in copy-on-select setting:",
  "    Terminal.app has no “copy on selection” option. Selected text is",
  "    available via the macOS primary/middle-click paste only inside Terminal;",
  "    to put a selection on the regular clipboard you must press ⌘C.",
  "    For true copy-on-select, use iTerm2, WezTerm, or Kitty instead.",
].join("\n");

const WEZTERM = [
  "  WezTerm — copy-on-select is ON by default:",
  "    Selecting text with the mouse already copies it to the clipboard.",
  "    (Controlled by the default mouse bindings; you don’t need to enable it.)",
  "    To turn it OFF, override the SelectTextAtMouseCursor mouse bindings in",
  "    ~/.wezterm.lua so CompleteSelection no longer copies.",
].join("\n");

const KITTY = [
  "  Kitty — turn on copy-on-select via kitty.conf:",
  "    1. Open ~/.config/kitty/kitty.conf.",
  "    2. Add this line:",
  "         copy_on_select yes",
  "    3. Save, then reload the config (Ctrl+Shift+F5) or restart Kitty.",
  "    Selecting text now copies it to the clipboard automatically.",
].join("\n");

const GNOME = [
  "  GNOME Terminal — copy-on-select is automatic (X11/Wayland primary selection):",
  "    Selecting text already copies it to the PRIMARY selection; paste it with a",
  "    middle-click. There is no separate setting to enable.",
  "    To also put it on the regular clipboard you must press Ctrl+Shift+C.",
].join("\n");

const WINDOWS_TERMINAL = [
  "  Windows Terminal — turn on copy-on-select in settings.json:",
  "    1. Settings → Open JSON file (or Ctrl+Shift+, ).",
  '    2. In the top-level "profiles" → "defaults" object (or per-profile), add:',
  '         "copyOnSelect": true',
  "    3. Save the file.",
  "    Selecting text now copies it to the clipboard automatically.",
].join("\n");

const GENERIC = [
  "  Generic terminal — copy-on-select:",
  "    Vanta couldn’t identify your terminal from TERM_PROGRAM/env.",
  "    Open your terminal’s selection/clipboard settings and look for an option",
  "    named “copy on select”, “copy to clipboard on selection”, or similar.",
  "    Many modern terminals (WezTerm, GNOME) already copy on select; some need",
  "    a config line (Kitty: copy_on_select yes; Windows Terminal: copyOnSelect: true).",
].join("\n");

/** Pure: the step-by-step text to enable copy-on-select for `kind`. Generated text only —
 *  this never touches the terminal's config; the operator applies it. Honest per-terminal:
 *  real settings where they exist, "on by default" / "no built-in setting" otherwise. */
export function copyOnSelectInstructions(kind: TerminalKind): string {
  switch (kind) {
    case "iterm2":
      return ITERM2;
    case "apple-terminal":
      return APPLE_TERMINAL;
    case "wezterm":
      return WEZTERM;
    case "kitty":
      return KITTY;
    case "gnome":
      return GNOME;
    case "windows-terminal":
      return WINDOWS_TERMINAL;
    case "unknown":
      return GENERIC;
  }
}

/** Detect the terminal from `env` and format the full help block (header + steps).
 *  This is what a `/copy-on-select` slash command or a terminal-setup section would print:
 *  call `copyOnSelectHelp(process.env)`. Print-only; writes nothing. */
export function copyOnSelectHelp(env: NodeJS.ProcessEnv): string {
  const kind = detectTerminal(env);
  const header = `  Detected: ${terminalLabel(kind)} — enable copy-on-select (auto-copy selected text)\n`;
  return `${header}${copyOnSelectInstructions(kind)}`;
}
