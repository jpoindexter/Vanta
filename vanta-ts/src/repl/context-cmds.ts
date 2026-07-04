import { join } from "node:path";
import { loadCron } from "../schedule/cron.js";
import { formatExport, formatHistory, lines } from "./format.js";
import { formatSessionCost } from "../pricing.js";
import { listSpend } from "../cost/ledger.js";
import { filterSpendSince, summarizeSpend, formatSpendBreakdown } from "../cost/attribution.js";
import type { SlashHandler } from "./types.js";

export const history: SlashHandler = (_arg, ctx) => ({ output: formatHistory(ctx.convo.messages) || "  (no history yet)" });

export const exportConvo: SlashHandler = async (_arg, ctx) => {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const dir = join(ctx.dataDir, "exports");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${ctx.state.sessionId}.md`);
  const body = `# ${ctx.state.title ?? ctx.state.sessionId}\n\n${formatExport(ctx.convo.messages)}\n`;
  await writeFile(file, body, "utf8");
  return { output: `  ⤓ exported to ${file}` };
};

export const compress: SlashHandler = async (arg, ctx) => {
  const { compactionDisabled } = await import("./compact-gate.js");
  if (compactionDisabled(ctx.env)) return { output: "  · compaction disabled (VANTA_DISABLE_COMPACT)" };
  const { compressMessages } = await import("../context.js");
  const { buildSummarizer } = await import("../session.js");
  const before = ctx.convo.messages.length;
  const instructions = arg.trim() || undefined;
  const compressed = await compressMessages(
    ctx.convo.messages,
    ctx.setup.provider.contextWindow(),
    buildSummarizer(ctx.setup.provider, instructions),
    { thresholdPct: 0 },
  );
  ctx.convo.messages.splice(0, Infinity, ...compressed);
  return { output: `  · compressed ${before} → ${compressed.length} messages` };
};

/** PCLIP-COST-ATTRIBUTION: `/usage breakdown [--since <ISO date>]` — persisted
 *  cross-session spend by goal/agent/provider/model (vs the plain `/usage`'s
 *  session-scoped view). Indented to match the rest of the /usage output. */
async function usageBreakdown(arg: string, ctx: Parameters<SlashHandler>[1]): Promise<{ output: string }> {
  const sinceRaw = /--since\s+(\S+)/.exec(arg)?.[1];
  let entries = await listSpend(ctx.dataDir);
  if (sinceRaw) {
    const sinceMs = Date.parse(sinceRaw);
    if (Number.isNaN(sinceMs)) return { output: `  invalid --since date: "${sinceRaw}" (expected an ISO date)` };
    entries = filterSpendSince(entries, sinceMs);
  }
  const report = formatSpendBreakdown(summarizeSpend(entries));
  return { output: report.split("\n").map((l) => (l ? `  ${l}` : l)).join("\n") };
}

export const usage: SlashHandler = (arg, ctx) => {
  if (arg.trim().split(/\s+/)[0] === "breakdown") return usageBreakdown(arg, ctx);
  const chars = ctx.convo.messages.reduce((n, m) => n + (("content" in m ? m.content : "") ?? "").length, 0);
  const est = Math.round(chars / 4);
  const ctxWin = ctx.setup.provider.contextWindow();
  const pct = ctxWin ? Math.round((est / ctxWin) * 100) : 0;
  return {
    output:
      `  ~${est.toLocaleString()} tokens / ${ctxWin.toLocaleString()} ctx (${pct}%) · ${ctx.state.turnIndex} turn(s) · ${ctx.setup.provider.modelId()}\n` +
      `  ${formatSessionCost(ctx.state.sessionCost)}\n` +
      `  (see \`/usage breakdown\` for spend by goal/agent/provider/model)`,
  };
};

export const mcp: SlashHandler = async (_arg, ctx) => {
  const { readMcpConfig } = await import("../mcp/mount.js");
  const cfg = await readMcpConfig(ctx.env).catch(() => ({ servers: {} as Record<string, unknown> }));
  const names = Object.keys(cfg.servers ?? {});
  return { output: lines(names.map((n) => `  ${n}`), "  (no MCP servers — set VANTA_MCP_SERVERS or ~/.vanta/mcp.json)") };
};

export const cron: SlashHandler = async (_arg, ctx) => {
  const entries = await loadCron(ctx.dataDir);
  return { output: lines(entries.map((e) => `  #${e.id} [${e.status}] ${e.cron} — ${e.instruction}`), "  (no scheduled tasks)") };
};
