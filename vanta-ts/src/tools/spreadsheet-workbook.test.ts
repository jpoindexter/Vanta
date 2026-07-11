import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { spreadsheetWorkbookTool } from "./spreadsheet-workbook.js";
import type { ToolContext } from "./types.js";

async function setup(approve: boolean): Promise<{ root: string; path: string; ctx: ToolContext }> {
  const root = await mkdtemp(join(tmpdir(), "vanta-sheet-tool-"));
  const path = join(root, "book.xlsx");
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Sheet1"); sheet.getCell("A1").value = 1; sheet.getCell("A2").value = { formula: "A1+1", result: 2 };
  await book.xlsx.writeFile(path);
  return { root, path, ctx: { root, safety: {} as ToolContext["safety"], requestApproval: vi.fn(async () => approve) } };
}

describe("spreadsheet_workbook tool", () => {
  it("inspects without approval", async () => {
    const { ctx } = await setup(false);
    const result = await spreadsheetWorkbookTool.execute({ action: "inspect", path: "book.xlsx", sheet: "Sheet1", range: "A1:A1" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("Sheet1!A1:A1");
    expect(ctx.requestApproval).not.toHaveBeenCalled();
  });

  it("explains a formula without approval", async () => {
    const { ctx } = await setup(false);
    const result = await spreadsheetWorkbookTool.execute({ action: "explain", path: "book.xlsx", sheet: "Sheet1", cell: "A2" }, ctx);
    expect(result).toMatchObject({ ok: true }); expect(result.output).toContain("adds"); expect(ctx.requestApproval).not.toHaveBeenCalled();
  });

  it("previews before approval and leaves a denied workbook unchanged", async () => {
    const { ctx } = await setup(false);
    const result = await spreadsheetWorkbookTool.execute({ action: "apply", path: "book.xlsx", changes: [{ kind: "set", sheet: "Sheet1", cell: "A1", value: 2 }] }, ctx);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("denied");
    expect(ctx.requestApproval).toHaveBeenCalledWith(expect.stringContaining("Sheet1!A1: 1 -> 2"), expect.any(String), "spreadsheet_workbook", expect.any(Object));
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(join(ctx.root, "book.xlsx"));
    expect(book.getWorksheet("Sheet1")?.getCell("A1").value).toBe(1);
  });

  it("applies approved changes and returns a receipt", async () => {
    const { ctx } = await setup(true);
    const result = await spreadsheetWorkbookTool.execute({ action: "apply", path: "book.xlsx", changes: [{ kind: "set", sheet: "Sheet1", cell: "A1", value: 2 }] }, ctx);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("verified");
    expect(result.output).toContain("receipt");
  });
});
