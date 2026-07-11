import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { generateFinanceModel } from "./finance.js";
import { FinanceBriefSchema, type FinanceBrief } from "./finance-schema.js";

const base = { version: 1 as const, company: "Acme", currency: "USD", years: 5 };
const operating = { revenue: 1000, revenueGrowth: 0.08, ebitdaMargin: 0.22, taxRate: 0.25, capexPercent: 0.05, depreciationPercent: 0.04, workingCapitalPercent: 0.1 };
const briefs: FinanceBrief[] = [
  FinanceBriefSchema.parse({ ...base, ...operating, model: "three_statement", grossMargin: 0.55, openingCash: 100, openingDebt: 200 }),
  FinanceBriefSchema.parse({ ...base, ...operating, model: "dcf", wacc: 0.1, terminalGrowth: 0.025, netDebt: 150, shares: 100 }),
  FinanceBriefSchema.parse({ ...base, model: "lbo", revenue: 1000, revenueGrowth: 0.08, ebitdaMargin: 0.22, entryMultiple: 10, exitMultiple: 11, debtMultiple: 5, interestRate: 0.08, debtPaydownPercent: 0.6, cash: 50 }),
  FinanceBriefSchema.parse({ ...base, model: "comps", comparables: [{ name: "A", enterpriseValue: 1200, revenue: 500, ebitda: 100 }, { name: "B", enterpriseValue: 1800, revenue: 600, ebitda: 150 }, { name: "C", enterpriseValue: 2000, revenue: 800, ebitda: 160 }], targetRevenue: 700, targetEbitda: 140, targetNetDebt: 100, targetShares: 50 }),
  FinanceBriefSchema.parse({ ...base, model: "merger", acquirerSharePrice: 50, acquirerShares: 100, acquirerNetIncome: 500, targetPurchasePrice: 1000, targetNetIncome: 80, stockPercent: 0.5, synergies: 40, taxRate: 0.25, cashInterestRate: 0.05 }),
];

describe("finance model packs", () => {
  it.each(briefs)("generates, reopens, and verifies $model", async (brief) => {
    const root = await mkdtemp(join(tmpdir(), "vanta-finance-")), path = join(root, `${brief.model}.xlsx`);
    const result = await generateFinanceModel(path, brief, { receiptDir: join(root, "receipts"), now: new Date("2026-07-11T12:00:00Z") });
    expect(result.verified).toBe(true); expect(result.formulaCount).toBeGreaterThanOrEqual(10); expect(result.checks.every((check) => check.passed)).toBe(true);
    const book = new ExcelJS.Workbook(); await book.xlsx.readFile(path); expect(book.getWorksheet("Assumptions")).toBeDefined(); expect(book.getWorksheet("Checks")).toBeDefined();
    expect(JSON.stringify(book.getWorksheet("Checks")?.getCell("C3").value)).toMatch(/ABS\(B3\)|B3>0/);
    const receipt = JSON.parse(await readFile(result.receiptPath, "utf8")); expect(receipt).toMatchObject({ model: brief.model, verified: true }); expect(JSON.stringify(receipt)).not.toContain("comparables");
  });

  it("includes 25-cell sensitivity grids for DCF and LBO", async () => {
    for (const brief of briefs.filter((item) => item.model === "dcf" || item.model === "lbo")) {
      const root = await mkdtemp(join(tmpdir(), "vanta-finance-sensitivity-")), path = join(root, `${brief.model}.xlsx`), result = await generateFinanceModel(path, brief, { receiptDir: join(root, "receipts") });
      expect(result.checks).toContainEqual({ name: "sensitivityCells", value: 25, passed: true });
      const book = new ExcelJS.Workbook(); await book.xlsx.readFile(path); const model = book.getWorksheet(brief.model === "dcf" ? "DCF" : "LBO")!;
      expect(JSON.stringify(model.getCell(brief.model === "dcf" ? "B24" : "B19").value)).not.toContain("VANTA_SENSITIVITY");
    }
  });
});
