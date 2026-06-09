import type { SlashHandler } from "./types.js";

export const wm: SlashHandler = (arg, ctx) => {
  const wmem = ctx.workingMemory;
  if (!wmem) return { output: "  (working memory not available in this context)" };
  if (!arg) {
    if (wmem.isEmpty()) return { output: "  (working memory empty — /wm <note> to add)" };
    return { output: `  Working memory:\n${wmem.getAll().map((s, i) => `    ${i + 1}. ${s}`).join("\n")}` };
  }
  wmem.add(arg);
  return { output: `  🧠 ${arg.slice(0, 80)}` };
};
