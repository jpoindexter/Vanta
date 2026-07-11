import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { runSpreadsheetCommand } from "./spreadsheet-cmd.js";

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "vanta-sheet-cli-"));
  const book = new ExcelJS.Workbook();
  book.addWorksheet("Data").getCell("A1").value = 5;
  await book.xlsx.writeFile(join(root, "book.xlsx"));
  await writeFile(join(root, "plan.json"), JSON.stringify({ changes: [{ kind: "set", sheet: "Data", cell: "A1", value: 8 }] }));
  const log = vi.fn();
  return { root, log };
}

describe("vanta spreadsheet", () => {
  it("inspects and previews without writing", async () => {
    const { root, log } = await setup();
    expect(await runSpreadsheetCommand(root, ["inspect", "book.xlsx", "--sheet", "Data", "--range", "A1:A1"], { log })).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Data!A1:A1"));
    expect(await runSpreadsheetCommand(root, ["preview", "book.xlsx", "--plan", "plan.json"], { log })).toBe(0);
    expect(log).toHaveBeenCalledWith("Data!A1: 5 -> 8");
  });

  it("requires --yes and then applies with a receipt", async () => {
    const { root, log } = await setup();
    expect(await runSpreadsheetCommand(root, ["apply", "book.xlsx", "--plan", "plan.json"], { log })).toBe(1);
    expect(await runSpreadsheetCommand(root, ["apply", "book.xlsx", "--plan", "plan.json", "--yes"], { log })).toBe(0);
    expect(log.mock.calls.flat().join("\n")).toContain("verified");
  });
});
