import { oneLine } from "./format.js";
import type { SlashHandler } from "./types.js";

// `/moim` — the "top of mind" pin. Bare shows it; `clear` removes it; any other
// text pins it (persisted for future sessions AND patched into the live system
// prompt so the agent honours it this turn too).
export const moim: SlashHandler = async (arg, ctx) => {
  const { readMoim, writeMoim, clearMoim } = await import("../moim/store.js");
  if (!arg) {
    const note = await readMoim(ctx.env);
    return { output: note ? `  ⚑ ${note}` : "  (nothing pinned — /moim <text> to set, /moim clear to remove)" };
  }
  if (arg.toLowerCase() === "clear") {
    await clearMoim(ctx.env);
    return { output: "  · top-of-mind cleared (removed from future sessions)" };
  }
  await writeMoim(arg, ctx.env);
  // Patch the live system prompt so the agent sees it in this session too.
  const sys = ctx.convo.messages[0];
  if (sys && sys.role === "system") {
    sys.content = `⚑ Top of mind (pinned by user — keep this in focus):\n${arg}\n\n${sys.content}`;
  }
  return { output: `  ⚑ pinned: ${oneLine(arg, 80)}` };
};
