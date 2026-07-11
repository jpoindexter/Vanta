import { readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { resolveInScope } from "../scope.js";
import { applyWorkbookPlan, explainWorkbookFormula, inspectWorkbook, previewWorkbookPlan, WorkbookPlanSchema } from "../spreadsheet/workbook.js";
import { generateFinanceModel } from "../spreadsheet/finance.js";
import { FinanceBriefSchema } from "../spreadsheet/finance-schema.js";

type Deps = { log?: (line: string) => void };
type CommandContext = { root: string; action: "inspect" | "explain" | "preview" | "apply"; path: string; args: string[]; log: (line: string) => void };
const USAGE = "usage: vanta spreadsheet inspect <book.xlsx> [--sheet Name --range A1:B10] | explain <book.xlsx> --sheet Name --cell B2 | preview|apply <book.xlsx> --plan plan.json [--yes] | model <brief.json> --out model.xlsx [--yes]";

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function scoped(path: string, root: string, extension: string): string {
  if (extname(path).toLowerCase() !== extension) throw new Error(`expected ${extension} file: ${path}`);
  const result = resolveInScope(path, root);
  if (!result.ok) throw new Error(`path is outside project scope: ${path}`);
  return result.path;
}

async function readPlan(root: string, args: string[]) {
  const path = flag(args, "--plan");
  if (!path) throw new Error("--plan <plan.json> is required");
  const raw = JSON.parse(await readFile(scoped(path, root, ".json"), "utf8"));
  const parsed = WorkbookPlanSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`invalid plan: ${parsed.error.issues[0]?.message ?? "invalid changes"}`);
  return parsed.data;
}

export async function runSpreadsheetCommand(root: string, args: string[], deps: Deps = {}): Promise<number> {
  const log = deps.log ?? console.log;
  const [action, path] = args;
  if (action === "model") return runModel(root, args, log);
  if (!action || !path || !["inspect", "explain", "preview", "apply"].includes(action)) { log(USAGE); return 1; }
  try {
    return await runAction({ root, action: action as CommandContext["action"], path, args, log });
  } catch (error) { log(`spreadsheet error: ${(error as Error).message}`); return 1; }
}

async function runModel(root: string, args: string[], log: (line: string) => void): Promise<number> {
  try {
    const briefPath = args[1], output = flag(args, "--out"); if (!briefPath || !output) throw new Error("model needs <brief.json> --out <model.xlsx>");
    const brief = FinanceBriefSchema.parse(JSON.parse(await readFile(scoped(briefPath, root, ".json"), "utf8"))), target = scoped(output, root, ".xlsx");
    log(`${brief.model} model for ${brief.company} · ${brief.years} years · ${brief.currency}`); if (!args.includes("--yes")) { log("not generated; review the brief and rerun with --yes"); return 1; }
    const result = await generateFinanceModel(target, brief, { receiptDir: join(root, ".vanta", "spreadsheet", "finance-receipts") }); log(`verified ${relative(root, target)} · ${result.formulaCount} formulas\nreceipt ${relative(root, result.receiptPath)}`); return 0;
  } catch (error) { log(`spreadsheet model error: ${(error as Error).message}`); return 1; }
}

async function runAction(context: CommandContext): Promise<number> {
  const { root, action, path, args, log } = context;
  const workbook = scoped(path, root, ".xlsx");
  if (action === "inspect") {
    const view = await inspectWorkbook(workbook, { sheet: flag(args, "--sheet"), range: flag(args, "--range") });
    log(view.range ? `${view.range.sheet}!${view.range.address}\n${JSON.stringify(view.range.rows)}` : view.sheets.map((sheet) => `${sheet.name} ${sheet.rows}x${sheet.columns} charts:${sheet.charts}`).join("\n"));
    return 0;
  }
  if (action === "explain") {
    const sheet = flag(args, "--sheet"), cell = flag(args, "--cell"); if (!sheet || !cell) throw new Error("--sheet and --cell are required");
    log(await explainWorkbookFormula(workbook, sheet, cell)); return 0;
  }
  const plan = await readPlan(root, args);
  const preview = await previewWorkbookPlan(workbook, plan);
  for (const line of preview.lines) log(line);
  if (action === "preview") return 0;
  if (!args.includes("--yes")) { log("not applied; review the preview and rerun with --yes"); return 1; }
  const result = await applyWorkbookPlan(workbook, plan, { receiptDir: join(root, ".vanta", "spreadsheet", "receipts") });
  log(`verified ${relative(root, workbook)}\nreceipt ${relative(root, result.receiptPath)}`);
  return 0;
}
