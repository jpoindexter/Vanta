import type { SlashHandler } from "./types.js";

const SUB_HELP = "  subcommands: fullscreen | exit | status";

export const tuiCommand: SlashHandler = (arg) => {
  const sub = arg.trim().toLowerCase();
  if (sub === "exit") return { exit: true };
  if (!sub || sub === "status") {
    return {
      output: [
        "  TUI: fullscreen alt-screen renderer (flicker-free).",
        "  Context-budget, tool events, and streaming text are live.",
        SUB_HELP,
      ].join("\n"),
    };
  }
  if (sub === "fullscreen") {
    return {
      output: [
        "  ✓ Already running in fullscreen mode.",
        "  The alt-screen renderer is active — context is fully preserved.",
        "  In the REPL? Run `vanta` (no args) on a TTY to start the fullscreen TUI.",
      ].join("\n"),
    };
  }
  return { output: `  Unknown subcommand '${sub}'.\n${SUB_HELP}` };
};
