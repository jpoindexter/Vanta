import type { ToolContext, ToolResult } from "./types.js";

/** No await: the file tool calls this after awaited preparation and before its synchronous commit. */
export function delegatedWriteDenial(ctx: ToolContext): ToolResult | null {
  if (!ctx.delegatedWritePath) return null;
  try { if (ctx.delegatedWriteCheck?.() === true) return null; }
  catch { /* An unreadable authority source cannot authorize a mutation. */ }
  return { ok: false, effectDisposition: "denied",
    output: "Delegated authority changed, was revoked, or could not be verified; file left unchanged. Request a fresh decision." };
}
