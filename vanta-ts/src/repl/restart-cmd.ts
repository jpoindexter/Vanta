import type { SlashHandler } from "./types.js";

// `/restart` — reload Vanta in place with fresh code. The agent exits with the
// sentinel code 75; run.sh's relaunch loop re-execs tsx (picking up edited
// source) instead of dropping the user back to the shell. The kernel reconnects
// on its own (kernel-launcher pings + auto-starts). Only offered when the loop
// is actually present (VANTA_RELAUNCH, set by run.sh) — otherwise exiting 75
// would just quit, so we refuse with a hint instead of surprising the user.
export const RESTART_EXIT_CODE = 75;

export const restart: SlashHandler = (_arg, ctx) => {
  if (!ctx.env.VANTA_RELAUNCH) {
    return {
      output: "  ⚠ /restart needs the run.sh relaunch loop — start Vanta via ./run.sh (or the `vanta` command) to reload in place.",
    };
  }
  return { output: "  ↻ reloading Vanta with fresh code…", restart: true };
};
