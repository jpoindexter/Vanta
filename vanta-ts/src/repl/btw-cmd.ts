import type { SlashHandler } from "./types.js";

/**
 * CC-BTW — `/btw <question>`
 * Sends a single-turn completion to the current provider WITHOUT touching
 * ctx.convo.messages. The answer is shown with a dim "⁻ btw:" prefix so
 * it's visually distinct from main conversation turns.
 */
export const btw: SlashHandler = async (arg, ctx) => {
  const q = arg.trim();
  if (!q) return { output: "  usage: /btw <question>" };

  const result = await ctx.setup.provider.complete(
    [{ role: "user", content: q }],
    [], // no tools — side question stays lightweight
  );

  const text = result.text.trim() || "(no response)";
  return { output: `  ⁻ btw: ${text}` };
};
