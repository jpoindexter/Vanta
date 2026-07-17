import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { runSpreadsheetCommand } from "./spreadsheet-cmd.js";

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "vanta-sheet-cli-"));
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Data"); sheet.getCell("A1").value = 5; sheet.getCell("A2").value = { formula: "A1*2", result: 10 };
  await book.xlsx.writeFile(join(root, "book.xlsx"));
  await writeFile(join(root, "plan.json"), JSON.stringify({ changes: [{ kind: "set", sheet: "Data", cell: "A1", value: 8 }] }));
  await writeFile(join(root, "dcf.json"), JSON.stringify({ version: 1, model: "dcf", company: "Acme", currency: "USD", years: 5, revenue: 1000, revenueGrowth: 0.08, ebitdaMargin: 0.22, taxRate: 0.25, capexPercent: 0.05, depreciationPercent: 0.04, workingCapitalPercent: 0.1, wacc: 0.1, terminalGrowth: 0.025, netDebt: 150, shares: 100 }));
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
    expect(await runSpreadsheetCommand(root, ["explain", "book.xlsx", "--sheet", "Data", "--cell", "A2"], { log })).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("multiplies"));
  });

  it("requires --yes and then applies with a receipt", async () => {
    const { root, log } = await setup();
    expect(await runSpreadsheetCommand(root, ["apply", "book.xlsx", "--plan", "plan.json"], { log })).toBe(1);
    expect(await runSpreadsheetCommand(root, ["apply", "book.xlsx", "--plan", "plan.json", "--yes"], { log })).toBe(0);
    expect(log.mock.calls.flat().join("\n")).toContain("verified");
  });

  it("previews and generates a verified finance model", async () => {
    const { root, log } = await setup();
    expect(await runSpreadsheetCommand(root, ["model", "dcf.json", "--out", "dcf.xlsx"], { log })).toBe(1);
    expect(await runSpreadsheetCommand(root, ["model", "dcf.json", "--out", "dcf.xlsx", "--yes"], { log })).toBe(0);
    expect(log.mock.calls.flat().join("\n")).toContain("verified dcf.xlsx");
  });

  it("records host proof only from a verified workbook receipt and explicit evidence", async () => {
    const { root, log } = await setup();
    await runSpreadsheetCommand(root, ["apply", "book.xlsx", "--plan", "plan.json", "--yes"], { log });
    const receipt = /receipt ([^\n]+)/.exec(log.mock.calls.flat().join("\n"))?.[1] ?? "";
    expect(receipt).not.toBe(""); const evidence = join(root, "sheets.png"); await writeFile(evidence, "google sheets host result");
    const args = ["host-proof", "--host", "google_sheets", "--receipt", receipt, "--session", "google-sheets-proof", "--evidence", evidence];
    expect(await runSpreadsheetCommand(root, args, { log })).toBe(1);
    expect(await runSpreadsheetCommand(root, [...args, "--yes"], { log })).toBe(0);
    expect(log.mock.calls.flat().join("\n")).toContain("recorded google_sheets host proof");
  });
});
