import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { recordSpreadsheetHostProof, SpreadsheetHostProofSchema } from "./host-proof.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vanta-sheet-host-"));
  const receiptDir = join(root, ".vanta", "spreadsheet", "receipts");
  await mkdir(receiptDir, { recursive: true });
  const receipt = join(receiptDir, "action.json");
  await writeFile(receipt, JSON.stringify({ workbook: join(root, "book.xlsx"), at: new Date(0).toISOString(), touched: ["Data!A1"], preview: ["Data!A1: 1 -> 2"], beforeSha256: "a".repeat(64), afterSha256: "b".repeat(64), verified: true }));
  const evidence = join(root, "host.png"); await writeFile(evidence, "real-host-screen");
  return { root, receipt, evidence };
}

describe("spreadsheet host proof", () => {
  it("binds verified workbook and copied host evidence into the canonical packet", async () => {
    const { root, evidence } = await fixture();
    const result = await recordSpreadsheetHostProof(root, { host: "google_sheets", workbookReceipt: ".vanta/spreadsheet/receipts/action.json", apiSessionId: "google-sheets-sheet_123", evidencePath: evidence, now: new Date(1000) });
    expect(SpreadsheetHostProofSchema.parse(JSON.parse(await readFile(result.packetPath, "utf8")))).toMatchObject({ ok: true, host: "google_sheets", approvalGatedAction: true, executedAt: new Date(1000).toISOString() });
    expect(await readFile(join(root, result.packet.evidenceArtifact), "utf8")).toBe("real-host-screen");
  });

  it("refuses receipts outside the canonical verified receipt directory", async () => {
    const { root, evidence } = await fixture();
    await writeFile(join(root, "fake.json"), "{}");
    await expect(recordSpreadsheetHostProof(root, { host: "excel", workbookReceipt: "fake.json", apiSessionId: "excel-proof", evidencePath: evidence })).rejects.toThrow("must be under");
  });

  it("refuses malformed or unverified workbook receipts", async () => {
    const { root, receipt, evidence } = await fixture(); await writeFile(receipt, JSON.stringify({ verified: false }));
    await expect(recordSpreadsheetHostProof(root, { host: "google_sheets", workbookReceipt: ".vanta/spreadsheet/receipts/action.json", apiSessionId: "sheet", evidencePath: evidence })).rejects.toThrow();
  });
});
