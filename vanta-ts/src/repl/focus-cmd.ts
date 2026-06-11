import type { SlashHandler } from "./types.js";

/**
 * /focus — toggle focus view: hides tool events, showing only user turns and
 * final assistant responses. Toggle again to restore the full transcript.
 */
export const focusCommand: SlashHandler = (_arg, _ctx) => {
  return {
    toggleFocusMode: true,
    output: "  /focus toggled — tool entries hidden in focus mode; /focus again to restore.",
  };
};
