import { z } from "zod";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Tool, ToolResult, ToolContext } from "./types.js";
import { resolveInScope } from "../scope.js";
import { distillTrace } from "../trace/distill.js";

const DEFAULT_TRACE = ".vanta/events.jsonl";

const Args = z.object({
  path: z.string().min(1).optional(),
});

/** Slot the detail file index into a stable, sorted filename. */
function detailName(index: number): string {
  return `issue-${String(index + 1).padStart(2, "0")}.md`;
}

async function readTrace(absPath: string): Promise<{ ok: true; jsonl: string } | { ok: false; output: string }> {
  try {
    return { ok: true, jsonl: await readFile(absPath, "utf8") };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ENOENT") return { ok: false, output: `no trace at ${absPath} — nothing to distill` };
    return { ok: false, output: `could not read trace ${absPath}: ${(err as Error).message}` };
  }
}

/** Write overview.md + one detail file per issue under .vanta/trace-reports/<ts>/. */
async function writeReports(
  ctx: ToolContext,
  overview: string,
  details: string[],
): Promise<{ dir: string; rel: string }> {
  const dir = join(ctx.root, ".vanta", "trace-reports", String(Date.now()));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "overview.md"), overview, "utf8");
  await Promise.all(details.map((body, i) => writeFile(join(dir, detailName(i)), body, "utf8")));
  return { dir, rel: relative(ctx.root, dir) };
}

export const distillTraceTool: Tool = {
  schema: {
    name: "distill_trace",
    description:
      "Distill a run's events.jsonl into a sourced root-cause report. Reads the trace " +
      "(default .vanta/events.jsonl), detects root-cause signals (errors, blocked/denied " +
      "actions, failures, stalls, retry/repeat loops, long gaps), and writes an overview.md " +
      "plus one detail file per issue under .vanta/trace-reports/<ts>/ — every claim citing " +
      "the source trace line(s) as L<n>. Returns the overview.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: `trace file to distill (default ${DEFAULT_TRACE})` },
      },
    },
  },
  describeForSafety: () => "distill a run trace into a root-cause report",
  async execute(raw, ctx): Promise<ToolResult> {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'distill_trace path must be a string' };

    const scoped = resolveInScope(parsed.data.path ?? DEFAULT_TRACE, ctx.root);
    if (!scoped.ok) return { ok: false, output: `trace path is outside the project: ${scoped.path}` };

    const trace = await readTrace(scoped.path);
    if (!trace.ok) return trace;

    const { overview, details } = distillTrace(trace.jsonl);
    let written: { dir: string; rel: string };
    try {
      written = await writeReports(ctx, overview, details);
    } catch (err) {
      return { ok: false, output: `distilled the trace but could not write the report: ${(err as Error).message}` };
    }

    const header = `Report: ${written.rel}/overview.md (+${details.length} detail file(s))\n\n`;
    return { ok: true, output: header + overview };
  },
};
