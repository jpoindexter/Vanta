import { ASTERISK_FRAMES } from "../term/figures.js";
import type { PendingTool } from "./types.js";

// VANTA-TOOL-LOADER — pure render rules for an in-flight tool entry. While a tool
// runs (call seen, result not yet) it gets its own loader row: an animated frame
// + the same Verb(detail) label the committed `⏺ Verb(detail)` row will show, so
// the in-progress entry transitions cleanly into the result. Parallel calls each
// resolve their own row (one per activeTool), driven by the shared busy tick.

/** Capitalize a verb for the loader label ("read" → "Read") — matches transcript. */
function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** The animated indicator frame for the running tool, from the shared spinner set. */
export function toolLoaderFrame(tick: number): string {
  return ASTERISK_FRAMES[tick % ASTERISK_FRAMES.length]!;
}

/** The tool's label while it runs: `Verb(detail)`, identical to the result header. */
export function toolLoaderLabel(tool: PendingTool): string {
  return `${cap(tool.verb)}${tool.detail ? `(${tool.detail})` : ""}`;
}

export type ToolLoaderRow = { key: string; frame: string; label: string };

/** One loader row per in-flight tool, so parallel calls each animate their own. */
export function toolLoaderRows(tools: PendingTool[], tick: number): ToolLoaderRow[] {
  const frame = toolLoaderFrame(tick);
  return tools.map((tool, i) => ({ key: `${tool.name}-${i}`, frame, label: toolLoaderLabel(tool) }));
}
