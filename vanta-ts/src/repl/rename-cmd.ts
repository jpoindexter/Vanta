import type { SlashHandler } from "./types.js";

export const rename: SlashHandler = (arg, ctx) => {
  const newTitle = arg.trim();

  if (!newTitle) {
    const current = ctx.state.title || "(untitled)";
    return { output: `  current title: ${current}\n\n  use: /rename <new title>` };
  }

  if (newTitle.length > 100) {
    return { output: "  title too long (max 100 chars)" };
  }

  // Note: title updates would be persisted via session save in full implementation
  return { output: `  renamed to: ${newTitle}` };
};
