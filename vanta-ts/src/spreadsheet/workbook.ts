import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import ExcelJS from "exceljs";
import { z } from "zod";
import { renderChartPng } from "./chart-image.js";
import { explainCellFormula } from "./formula.js";

export type Scalar = string | number | boolean | null;
export const WorkbookChangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("set"), sheet: z.string().min(1).max(31), cell: z.string().min(2), value: z.union([z.string(), z.number().finite(), z.boolean(), z.null()]) }),
  z.object({ kind: z.literal("formula"), sheet: z.string().min(1).max(31), cell: z.string().min(2), formula: z.string().min(1).max(1000) }),
  z.object({ kind: z.literal("add_sheet"), sheet: z.string().min(1).max(31) }),
  z.object({ kind: z.literal("delete_sheet"), sheet: z.string().min(1).max(31) }),
  z.object({
    kind: z.literal("chart"), sheet: z.string().min(1).max(31), chartType: z.enum(["bar", "line"]), title: z.string().trim().min(1).max(120),
    titleCell: z.string().min(2), sourceRange: z.string().min(3), from: z.string().min(2), to: z.string().min(2),
  }),
]);
export const WorkbookPlanSchema = z.object({ changes: z.array(WorkbookChangeSchema).min(1).max(500) });
export type WorkbookChange = z.infer<typeof WorkbookChangeSchema>;
export type WorkbookPlan = z.infer<typeof WorkbookPlanSchema>;
export type InspectOptions = { sheet?: string; range?: string };
export type CellView = Scalar | { formula: string; result?: Scalar };

type Bounds = { startRow: number; endRow: number; startCol: number; endCol: number };
type ApplyOptions = { receiptDir: string; now?: Date };

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function columnNumber(label: string): number {
  return [...label.toUpperCase()].reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0);
}

function cellPosition(address: string): { row: number; col: number } {
  const match = /^([A-Z]{1,3})([1-9][0-9]{0,6})$/i.exec(address);
  if (!match) throw new Error(`invalid cell address: ${address}`);
  return { col: columnNumber(match[1]!), row: Number(match[2]) };
}

function rangeBounds(range: string): Bounds {
  const [from, to = from] = range.split(":");
  if (!from || !to) throw new Error(`invalid range: ${range}`);
  const start = cellPosition(from);
  const end = cellPosition(to);
  if (end.row < start.row || end.col < start.col) throw new Error(`range must run top-left to bottom-right: ${range}`);
  if ((end.row - start.row + 1) * (end.col - start.col + 1) > 10_000) throw new Error("range exceeds 10,000 cells");
  return { startRow: start.row, endRow: end.row, startCol: start.col, endCol: end.col };
}

function cellView(value: ExcelJS.CellValue): CellView {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  return objectCellView(value);
}

function objectCellView(value: Exclude<ExcelJS.CellValue, Scalar | Date | undefined>): CellView {
  if (typeof value === "object" && "formula" in value) {
    const result = "result" in value ? value.result : undefined;
    const normalized = result === undefined ? undefined : cellView(result as ExcelJS.CellValue);
    return { formula: String(value.formula), ...(normalized === undefined || typeof normalized === "object" ? {} : { result: normalized }) };
  }
  if (typeof value === "object" && "text" in value) return String(value.text);
  return String(value);
}

async function load(path: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  return workbook;
}

function readRange(sheet: ExcelJS.Worksheet, range: string): CellView[][] {
  const bounds = rangeBounds(range);
  const rows: CellView[][] = [];
  for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
    const values: CellView[] = [];
    for (let col = bounds.startCol; col <= bounds.endCol; col += 1) values.push(cellView(sheet.getCell(row, col).value));
    rows.push(values);
  }
  return rows;
}

export async function inspectWorkbook(path: string, options: InspectOptions = {}) {
  const workbook = await load(path);
  const sheets = workbook.worksheets.map((sheet) => ({ name: sheet.name, rows: sheet.actualRowCount, columns: sheet.actualColumnCount, charts: sheet.getImages().length }));
  if (!options.sheet && !options.range) return { sheets };
  if (!options.sheet || !options.range) throw new Error("sheet and range are required together");
  const sheet = workbook.getWorksheet(options.sheet);
  if (!sheet) throw new Error(`sheet not found: ${options.sheet}`);
  return { sheets, range: { sheet: sheet.name, address: options.range, rows: readRange(sheet, options.range) } };
}

export async function explainWorkbookFormula(path: string, sheetName: string, cell: string): Promise<string> {
  const workbook = await load(path), sheet = workbook.getWorksheet(sheetName); cellPosition(cell);
  if (!sheet) throw new Error(`sheet not found: ${sheetName}`);
  return explainCellFormula(sheet, cell);
}

function display(value: CellView): string {
  if (value && typeof value === "object") return `=${value.formula}`;
  return JSON.stringify(value);
}

export async function previewWorkbookPlan(path: string, plan: WorkbookPlan): Promise<{ lines: string[]; touched: string[] }> {
  const workbook = await load(path);
  const lines: string[] = [];
  const touched: string[] = [];
  for (const change of plan.changes) {
    touched.push(change.kind === "set" || change.kind === "formula" ? `${change.sheet}!${change.cell}` : change.kind === "chart" ? `${change.sheet}!${change.sourceRange}` : change.sheet);
    if (change.kind === "add_sheet") { lines.push(`add sheet ${change.sheet}`); continue; }
    if (change.kind === "delete_sheet") { lines.push(`delete sheet ${change.sheet}`); continue; }
    const sheet = workbook.getWorksheet(change.sheet);
    if (!sheet) throw new Error(`sheet not found: ${change.sheet}`);
    if (change.kind === "chart") {
      rangeBounds(change.sourceRange); cellPosition(change.titleCell); rangeBounds(`${change.from}:${change.to}`);
      lines.push(`add ${change.chartType} chart "${change.title}" from ${change.sheet}!${change.sourceRange} at ${change.from}:${change.to}`); continue;
    }
    cellPosition(change.cell);
    const before = display(cellView(sheet.getCell(change.cell).value));
    const after = change.kind === "formula" ? `=${change.formula}` : display(change.value);
    lines.push(`${change.sheet}!${change.cell}: ${before} -> ${after}`);
  }
  return { lines, touched };
}

function chartSeries(sheet: ExcelJS.Worksheet, range: string): number[][] {
  const bounds = rangeBounds(range), series: number[][] = [];
  for (let col = bounds.startCol; col <= bounds.endCol; col += 1) {
    const values: number[] = [];
    for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
      const value = sheet.getCell(row, col).value, numeric = typeof value === "number" ? value : value && typeof value === "object" && "result" in value && typeof value.result === "number" ? value.result : null;
      if (numeric !== null) values.push(numeric);
    }
    if (values.length) series.push(values);
  }
  return series;
}

function applyCellChanges(workbook: ExcelJS.Workbook, plan: WorkbookPlan): void {
  for (const change of plan.changes.filter((item) => item.kind !== "chart")) {
    if (change.kind === "add_sheet") { if (workbook.getWorksheet(change.sheet)) throw new Error(`sheet already exists: ${change.sheet}`); workbook.addWorksheet(change.sheet); continue; }
    if (change.kind === "delete_sheet") { const sheet = workbook.getWorksheet(change.sheet); if (!sheet) throw new Error(`sheet not found: ${change.sheet}`); if (workbook.worksheets.length === 1) throw new Error("cannot delete the last sheet"); workbook.removeWorksheet(sheet.id); continue; }
    const sheet = workbook.getWorksheet(change.sheet);
    if (!sheet) throw new Error(`sheet not found: ${change.sheet}`);
    cellPosition(change.cell);
    sheet.getCell(change.cell).value = change.kind === "formula" ? { formula: change.formula } : change.value;
  }
}

function applyCharts(workbook: ExcelJS.Workbook, plan: WorkbookPlan): void {
  for (const change of plan.changes.filter((item) => item.kind === "chart")) {
    const sheet = workbook.getWorksheet(change.sheet); if (!sheet) throw new Error(`sheet not found: ${change.sheet}`);
    const image = workbook.addImage({ base64: renderChartPng(change.chartType, chartSeries(sheet, change.sourceRange)).toString("base64"), extension: "png" });
    sheet.getCell(change.titleCell).value = change.title; sheet.getCell(change.titleCell).font = { bold: true, size: 14 };
    sheet.addImage(image, `${change.from}:${change.to}`);
  }
}

function verifyChange(workbook: ExcelJS.Workbook, change: WorkbookChange): boolean {
  if (change.kind === "add_sheet") return Boolean(workbook.getWorksheet(change.sheet));
  if (change.kind === "delete_sheet") return !workbook.getWorksheet(change.sheet);
  const sheet = workbook.getWorksheet(change.sheet);
  if (!sheet) return false;
  if (change.kind === "chart") return sheet.getCell(change.titleCell).value === change.title && sheet.getImages().length > 0;
  if (change.kind === "set") return cellView(sheet.getCell(change.cell).value) === change.value;
  const value = sheet.getCell(change.cell).value;
  return Boolean(value && typeof value === "object" && "formula" in value && value.formula === change.formula);
}

async function verifyPlan(path: string, plan: WorkbookPlan): Promise<boolean> {
  const workbook = await load(path);
  return plan.changes.every((change) => verifyChange(workbook, change));
}

export async function applyWorkbookPlan(path: string, plan: WorkbookPlan, options: ApplyOptions) {
  const before = await readFile(path);
  const preview = await previewWorkbookPlan(path, plan);
  const workbook = await load(path);
  applyCellChanges(workbook, plan); applyCharts(workbook, plan);
  const temp = join(dirname(path), `.${randomUUID()}.xlsx`);
  await workbook.xlsx.writeFile(temp);
  const verified = await verifyPlan(temp, plan);
  if (!verified) { await rm(temp, { force: true }); throw new Error("workbook verification failed; original left unchanged"); }
  await rename(temp, path);
  const after = await readFile(path);
  const receipt = { workbook: path, at: (options.now ?? new Date()).toISOString(), touched: preview.touched, preview: preview.lines, beforeSha256: sha256(before), afterSha256: sha256(after), verified };
  await mkdir(options.receiptDir, { recursive: true });
  const receiptPath = join(options.receiptDir, `${randomUUID()}.json`);
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return { verified, receiptPath, preview };
}
