import { extname, join, relative } from "node:path";
import { stat } from "node:fs/promises";
import { z } from "zod";
import { resolveInScope } from "../scope.js";
import { applyWorkbookPlan, inspectWorkbook, previewWorkbookPlan, WorkbookChangeSchema } from "../spreadsheet/workbook.js";
import type { Tool } from "./types.js";

const Args = z.object({ action: z.enum(["inspect", "preview", "apply"]), path: z.string().min(1), sheet: z.string().optional(), range: z.string().optional(), changes: z.array(WorkbookChangeSchema).min(1).max(500).optional() });

async function workbookPath(path: string, root: string): Promise<{ ok: true; abs: string } | { ok: false; error: string }> {
  if (extname(path).toLowerCase() !== ".xlsx") return { ok: false, error: "spreadsheet_workbook supports .xlsx files only" };
  const scoped = resolveInScope(path, root);
  if (!scoped.ok) return { ok: false, error: `path is outside project scope: ${path}` };
  try { const info = await stat(scoped.path); if (!info.isFile()) throw new Error("not a file"); if (info.size > 50 * 1024 * 1024) return { ok: false, error: "workbook exceeds 50 MiB" }; }
  catch (error) { return { ok: false, error: `could not read workbook: ${(error as Error).message}` }; }
  return { ok: true, abs: scoped.path };
}

export const spreadsheetWorkbookTool: Tool = {
  schema: {
    name: "spreadsheet_workbook",
    description: "Inspect, preview, or approval-gated apply cell, formula, and sheet changes to a scoped local .xlsx workbook. Apply reopens the result and writes a SHA-256 receipt.",
    parameters: { type: "object", required: ["action", "path"], properties: {
      action: { type: "string", enum: ["inspect", "preview", "apply"] }, path: { type: "string" }, sheet: { type: "string" }, range: { type: "string" },
      changes: { type: "array", maxItems: 500, items: { type: "object", description: "Change: set/formula requires sheet+cell; add_sheet/delete_sheet requires sheet." } },
    } },
  },
  describeForSafety: (args) => `${String(args.action)} workbook ${String(args.path)}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: `invalid spreadsheet request: ${parsed.error.issues[0]?.message ?? "invalid input"}` };
    const resolved = await workbookPath(parsed.data.path, ctx.root);
    if (!resolved.ok) return { ok: false, output: resolved.error };
    try {
      if (parsed.data.action === "inspect") {
        const view = await inspectWorkbook(resolved.abs, { sheet: parsed.data.sheet, range: parsed.data.range });
        const label = view.range ? `${view.range.sheet}!${view.range.address}\n${JSON.stringify(view.range.rows)}` : view.sheets.map((sheet) => `${sheet.name} ${sheet.rows}x${sheet.columns}`).join("\n");
        return { ok: true, output: label };
      }
      if (!parsed.data.changes) return { ok: false, output: "preview/apply requires changes" };
      const plan = { changes: parsed.data.changes };
      const preview = await previewWorkbookPlan(resolved.abs, plan);
      if (parsed.data.action === "preview") return { ok: true, output: preview.lines.join("\n") };
      const detail = preview.lines.join("\n");
      const approved = await ctx.requestApproval(`Apply workbook changes:\n${detail}`, "modifies a local workbook after preview", "spreadsheet_workbook", { diff: detail });
      if (!approved) return { ok: false, output: `workbook update denied; ${parsed.data.path} left unchanged` };
      const result = await applyWorkbookPlan(resolved.abs, plan, { receiptDir: join(ctx.root, ".vanta", "spreadsheet", "receipts") });
      return { ok: true, output: `workbook verified: ${relative(ctx.root, resolved.abs)}\nreceipt: ${relative(ctx.root, result.receiptPath)}` };
    } catch (error) { return { ok: false, output: `spreadsheet error: ${(error as Error).message}` }; }
  },
};
