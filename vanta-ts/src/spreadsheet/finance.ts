import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import ExcelJS from "exceljs";
import { buildFinanceWorkbook } from "./finance-builders.js";
import { countFormulas, formatSheet, headers, title } from "./finance-common.js";
import type { FinanceBrief } from "./finance-schema.js";

type GenerateOptions = { receiptDir: string; now?: Date };
type Check = { name: string; value: number; passed: boolean };

function checkPassed(name: string, value: number): boolean {
  if (["balance", "sourcesUses", "consideration"].includes(name)) return Math.abs(value) < 0.000001;
  if (name === "sensitivityCells") return value === 25;
  return Number.isFinite(value) && value > 0;
}

function checkFormula(name: string, row: number): string {
  if (["balance", "sourcesUses", "consideration"].includes(name)) return `IF(ABS(B${row})<0.000001,"PASS","FAIL")`;
  if (name === "sensitivityCells") return `IF(B${row}=25,"PASS","FAIL")`;
  return `IF(B${row}>0,"PASS","FAIL")`;
}

function addChecks(book: ExcelJS.Workbook, checks: Record<string, number>): Check[] {
  const results = Object.entries(checks).map(([name, value]) => ({ name, value, passed: checkPassed(name, value) }));
  const sheet = book.addWorksheet("Checks"); title(sheet, "Model checks", 4); headers(sheet, 2, ["Check", "Value", "Status"]);
  results.forEach((check, index) => { const row = index + 3; sheet.getCell(row, 1).value = check.name; sheet.getCell(row, 2).value = check.value; sheet.getCell(row, 3).value = { formula: checkFormula(check.name, row), result: check.passed ? "PASS" : "FAIL" }; });
  formatSheet(sheet); return results;
}

async function verify(path: string, model: FinanceBrief["model"], checks: readonly Check[]): Promise<{ formulaCount: number; verified: boolean }> {
  const book = new ExcelJS.Workbook(); await book.xlsx.readFile(path); const formulaCount = countFormulas(book), checkSheet = book.getWorksheet("Checks");
  const statuses = checks.map((_, index) => checkSheet?.getCell(index + 3, 3).value).map((value) => value && typeof value === "object" && "result" in value ? value.result : value);
  const modelSheet = { three_statement: "Three Statement", dcf: "DCF", lbo: "LBO", comps: "Comps", merger: "Merger" }[model];
  return { formulaCount, verified: Boolean(book.getWorksheet("Assumptions") && book.getWorksheet(modelSheet) && checkSheet && formulaCount >= 10 && statuses.every((status) => status === "PASS")) };
}

function hash(value: Buffer | string): string { return createHash("sha256").update(value).digest("hex"); }

export async function generateFinanceModel(path: string, brief: FinanceBrief, options: GenerateOptions) {
  const book = new ExcelJS.Workbook(); book.creator = "Vanta"; book.created = options.now ?? new Date(); book.calcProperties.fullCalcOnLoad = true;
  const built = buildFinanceWorkbook(book, brief), checks = addChecks(book, built.checks), temp = join(dirname(path), `.${randomUUID()}.xlsx`); await mkdir(dirname(path), { recursive: true });
  try {
    await book.xlsx.writeFile(temp); const verification = await verify(temp, brief.model, checks); if (!verification.verified) throw new Error("finance model verification failed"); await rename(temp, path);
    const bytes = await readFile(path), receipt = { version: 1, at: (options.now ?? new Date()).toISOString(), model: brief.model, company: brief.company, currency: brief.currency, years: brief.years, briefHash: hash(JSON.stringify(brief)), workbookSha256: hash(bytes), formulaCount: verification.formulaCount, checks, keyMetric: built.keyMetric, verified: true };
    await mkdir(options.receiptDir, { recursive: true, mode: 0o700 }); const receiptPath = join(options.receiptDir, `${randomUUID()}.json`); await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 }); return { path, receiptPath, ...verification, checks };
  } catch (error) { await rm(temp, { force: true }); throw error; }
}
