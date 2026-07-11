import { extname, join, relative } from "node:path";
import { z } from "zod";
import { resolveInScope } from "../scope.js";
import { generateFinanceModel } from "../spreadsheet/finance.js";
import { FinanceBriefSchema } from "../spreadsheet/finance-schema.js";
import type { Tool } from "./types.js";

const Args = z.object({ action: z.enum(["preview", "generate"]), path: z.string().min(1), brief: FinanceBriefSchema });

function outputPath(path: string, root: string): string {
  if (extname(path).toLowerCase() !== ".xlsx") throw new Error("finance model output must be .xlsx");
  const scoped = resolveInScope(path, root); if (!scoped.ok) throw new Error("finance model output is outside project scope"); return scoped.path;
}

function preview(brief: z.infer<typeof FinanceBriefSchema>, path: string): string {
  return [`model: ${brief.model}`, `company: ${brief.company}`, `currency: ${brief.currency}`, `forecast: ${brief.years} years`, `output: ${path}`, "verification: reopen formulas, checks, and sensitivity where applicable"].join("\n");
}

export const financeModelTool: Tool = {
  schema: {
    name: "finance_model",
    description: "Preview or generate a formula-driven three-statement, DCF, comps, LBO, or merger workbook with checks, sensitivity tables where applicable, reopen verification, and a SHA-256 receipt.",
    parameters: { type: "object", required: ["action", "path", "brief"], properties: {
      action: { type: "string", enum: ["preview", "generate"] }, path: { type: "string", description: "Scoped .xlsx output path." },
      brief: { type: "object", description: "Strict version-1 finance brief. model is three_statement, dcf, comps, lbo, or merger." },
    } },
  },
  describeForSafety: (args) => `${String(args.action)} finance workbook ${String(args.path)}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw); if (!parsed.success) return { ok: false, output: `invalid finance model: ${parsed.error.issues[0]?.message ?? "invalid brief"}` };
    try {
      const target = outputPath(parsed.data.path, ctx.root), detail = preview(parsed.data.brief, parsed.data.path); if (parsed.data.action === "preview") return { ok: true, output: detail };
      if (!await ctx.requestApproval(`Generate finance workbook:\n${detail}`, "writes a verified local workbook", "finance_model", { diff: detail })) return { ok: false, output: "finance model generation denied; no workbook written" };
      const result = await generateFinanceModel(target, parsed.data.brief, { receiptDir: join(ctx.root, ".vanta", "spreadsheet", "finance-receipts") });
      return { ok: true, output: `finance model verified: ${relative(ctx.root, target)} · ${result.formulaCount} formulas\nreceipt: ${relative(ctx.root, result.receiptPath)}` };
    } catch (error) { return { ok: false, output: `finance model error: ${(error as Error).message}` }; }
  },
};
