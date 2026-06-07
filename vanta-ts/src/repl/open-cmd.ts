import { openInEditor } from "../editor/open.js";
import type { SlashHandler } from "./types.js";

// CC-EDITOR — `/open <file[:line]>` opens the reference in the configured editor
// (VANTA_EDITOR > VISUAL > EDITOR, default `code`). The CLI form is `vanta open`.
export const open: SlashHandler = async (arg, ctx) => {
  if (!arg.trim()) return { output: "  usage: /open <file[:line]>" };
  const r = await openInEditor(arg.trim(), ctx.env);
  return { output: `  ${r.message}` };
};
