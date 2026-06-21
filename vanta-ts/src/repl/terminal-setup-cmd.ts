// /terminal-setup — detect the current terminal and print the exact steps to make
// Shift+Enter insert a newline in the prompt (so multi-line input is easy).
//
// Print-only by design: we GENERATE the config + instructions and show them; we never
// auto-write the terminal's own config (safer — the operator pastes the change themselves).

import type { ReplCtx, SlashResult, SlashHandler } from "./types.js";

/** Terminals we ship Shift+Enter instructions for; `unknown` falls back to a generic note. */
export type Terminal = "iterm" | "apple-terminal" | "vscode" | "wezterm" | "unknown";

/** Pure terminal detection from the environment (mainly `TERM_PROGRAM`). Conservative:
 *  an unrecognized terminal returns `unknown` so the handler prints the generic note. */
export function detectTerminal(env: NodeJS.ProcessEnv): Terminal {
  const program = (env.TERM_PROGRAM ?? "").toLowerCase();
  if (program.includes("iterm")) return "iterm";
  if (program.includes("apple_terminal")) return "apple-terminal";
  if (program.includes("vscode")) return "vscode";
  if (program.includes("wezterm") || env.WEZTERM_PANE) return "wezterm";
  return "unknown";
}

/** Human label for each detected terminal (used in the printed header). */
export function terminalLabel(terminal: Terminal): string {
  switch (terminal) {
    case "iterm":
      return "iTerm2";
    case "apple-terminal":
      return "Apple Terminal";
    case "vscode":
      return "VS Code integrated terminal";
    case "wezterm":
      return "WezTerm";
    case "unknown":
      return "your terminal";
  }
}

const ITERM = [
  "  iTerm2 — bind Shift+Enter to send a newline:",
  "    1. Settings (⌘,) → Profiles → Keys → Key Mappings.",
  "    2. Click + to add a mapping.",
  "    3. Press the Shift+Enter shortcut into the Keyboard Shortcut field.",
  "    4. Set Action to “Send Text with “vim” Special Chars”.",
  "    5. In the text field enter \\n (a literal backslash-n).",
  "    6. Click OK — Shift+Enter now inserts a newline in the prompt.",
].join("\n");

const APPLE_TERMINAL = [
  "  Apple Terminal — bind Shift+Enter to send a newline:",
  "    1. Settings (⌘,) → Profiles → Keyboard.",
  "    2. Tick “Use Option as Meta key” is NOT needed; click + under the key list.",
  "    3. For Key choose Enter (Return) and tick the Shift modifier.",
  "    4. Set the Action to “Send Text” and enter the value \\012 (octal for newline).",
  "    5. Click the close/OK — Shift+Enter now inserts a newline in the prompt.",
].join("\n");

const VSCODE = [
  "  VS Code integrated terminal — add this to keybindings.json",
  "  (Command Palette → “Preferences: Open Keyboard Shortcuts (JSON)”):",
  "    {",
  '      "key": "shift+enter",',
  '      "command": "workbench.action.terminal.sendSequence",',
  '      "args": { "text": "\\n" },',
  '      "when": "terminalFocus"',
  "    }",
  "  Save the file — Shift+Enter now inserts a newline in the terminal prompt.",
].join("\n");

const WEZTERM = [
  "  WezTerm — add this key binding to ~/.wezterm.lua",
  "  (inside your config’s `keys = { ... }` table):",
  "    {",
  '      key = "Enter",',
  '      mods = "SHIFT",',
  '      action = wezterm.action.SendString("\\n"),',
  "    }",
  "  Reload the config (it auto-reloads on save) — Shift+Enter inserts a newline.",
].join("\n");

const GENERIC = [
  "  Generic terminal — Shift+Enter newline setup:",
  "    Vanta couldn’t identify your terminal from TERM_PROGRAM.",
  "    Open your terminal’s keyboard/key-mapping settings and add a binding that",
  "    maps Shift+Enter to send the newline character (\\n, hex 0x0A / octal \\012).",
  "    Most terminals call this “Send Text”, “Send String”, or “Key Mappings”.",
  "    Many shells also accept ⌥+Enter (Option+Enter) for a literal newline — try that",
  "    if your terminal can’t rebind Shift+Enter.",
].join("\n");

/** Pure: the step-by-step text for `terminal` to bind Shift+Enter → newline. Generated
 *  text only — this never touches the terminal's config; the operator applies it. */
export function terminalSetupInstructions(terminal: Terminal): string {
  switch (terminal) {
    case "iterm":
      return ITERM;
    case "apple-terminal":
      return APPLE_TERMINAL;
    case "vscode":
      return VSCODE;
    case "wezterm":
      return WEZTERM;
    case "unknown":
      return GENERIC;
  }
}

/** /terminal-setup — detect the terminal and print its Shift+Enter newline instructions.
 *  Print-only: returns the instructions as `output`; writes nothing. */
export const terminalSetup: SlashHandler = (_arg: string, ctx: ReplCtx): SlashResult => {
  const terminal = detectTerminal(ctx.env);
  const header = `  Detected: ${terminalLabel(terminal)} — make Shift+Enter insert a newline\n`;
  return { output: `${header}${terminalSetupInstructions(terminal)}` };
};
