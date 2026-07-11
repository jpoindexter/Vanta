import { readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { resolveInScope } from "../scope.js";
import { applyWorkbookPlan, inspectWorkbook, previewWorkbookPlan, WorkbookPlanSchema } from "../spreadsheet/workbook.js";

type Deps = { log?: (line: string) => void };
type CommandContext = { root: string; action: "inspect" | "preview" | "apply"; path: string; args: string[]; log: (line: string) => void };
const USAGE = "usage: vanta spreadsheet inspect <book.xlsx> [--sheet Name --range A1:B10] | preview|apply <book.xlsx> --plan plan.json [--yes]";

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
  if (!action || !path || !["inspect", "preview", "apply"].includes(action)) { log(USAGE); return 1; }
  try {
    return await runAction({ root, action: action as CommandContext["action"], path, args, log });
  } catch (error) { log(`spreadsheet error: ${(error as Error).message}`); return 1; }
}

async function runAction(context: CommandContext): Promise<number> {
  const { root, action, path, args, log } = context;
  const workbook = scoped(path, root, ".xlsx");
  if (action === "inspect") {
    const view = await inspectWorkbook(workbook, { sheet: flag(args, "--sheet"), range: flag(args, "--range") });
    log(view.range ? `${view.range.sheet}!${view.range.address}\n${JSON.stringify(view.range.rows)}` : view.sheets.map((sheet) => `${sheet.name} ${sheet.rows}x${sheet.columns}`).join("\n"));
    return 0;
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
