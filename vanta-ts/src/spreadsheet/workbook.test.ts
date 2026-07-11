import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { applyWorkbookPlan, inspectWorkbook, previewWorkbookPlan, type WorkbookPlan } from "./workbook.js";

async function fixture(): Promise<{ root: string; path: string }> {
  const root = await mkdtemp(join(tmpdir(), "vanta-workbook-"));
  const path = join(root, "model.xlsx");
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Summary");
  sheet.getCell("A1").value = "Revenue";
  sheet.getCell("B1").value = 100;
  sheet.getCell("B2").value = { formula: "B1*1.1", result: 110 };
  book.addWorksheet("Delete me");
  await book.xlsx.writeFile(path);
  return { root, path };
}

const plan: WorkbookPlan = {
  changes: [
    { kind: "set", sheet: "Summary", cell: "B1", value: 125 },
    { kind: "formula", sheet: "Summary", cell: "B2", formula: "B1*1.2" },
    { kind: "add_sheet", sheet: "Forecast" },
    { kind: "delete_sheet", sheet: "Delete me" },
  ],
};

describe("spreadsheet workbook workflow", () => {
  it("inspects sheets, ranges, values, and formulas", async () => {
    const { path } = await fixture();
    const view = await inspectWorkbook(path, { sheet: "Summary", range: "A1:B2" });
    expect(view.sheets.map((sheet) => sheet.name)).toEqual(["Summary", "Delete me"]);
    expect(view.range?.rows).toEqual([["Revenue", 100], [null, { formula: "B1*1.1", result: 110 }]]);
  });

  it("previews changes without mutating the workbook", async () => {
    const { path } = await fixture();
    const before = await readFile(path);
    const preview = await previewWorkbookPlan(path, plan);
    expect(preview.lines).toContain("Summary!B1: 100 -> 125");
    expect(preview.lines).toContain("add sheet Forecast");
    expect(await readFile(path)).toEqual(before);
  });

  it("applies, reopens, verifies, and writes a range-level receipt", async () => {
    const { root, path } = await fixture();
    const result = await applyWorkbookPlan(path, plan, { receiptDir: join(root, "receipts"), now: new Date("2026-07-11T00:00:00Z") });
    expect(result.verified).toBe(true);
    const view = await inspectWorkbook(path, { sheet: "Summary", range: "B1:B2" });
    expect(view.range?.rows).toEqual([[125], [{ formula: "B1*1.2" }]]);
    expect(view.sheets.map((sheet) => sheet.name)).toEqual(["Summary", "Forecast"]);
    const receipt = JSON.parse(await readFile(result.receiptPath, "utf8"));
    expect(receipt).toMatchObject({ workbook: path, verified: true, touched: ["Summary!B1", "Summary!B2", "Forecast", "Delete me"] });
    expect(receipt.beforeSha256).not.toBe(receipt.afterSha256);
  });
});
