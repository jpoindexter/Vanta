import { describe, expect, it } from "vitest";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assessReceipts, writeReceiptVault } from "./research-receipts.js";

describe("research receipts skeptic gate", () => {
  it("keeps only sourced, dated, unexpired claims that survive skeptic wording checks", () => {
    const report = assessReceipts([
      { claim: "According to the benchmark, Vanta passed 10/10 checks", source: "https://example.com/report", date: "2026-07-01", expiry: "2026-08-01" },
      { claim: "Vanta is always the best", source: "https://example.com/blog", date: "2026-07-01", expiry: "2026-08-01" },
      { claim: "Old fact", source: "https://example.com/old", date: "2026-06-01", expiry: "2026-06-15" },
      { claim: "Missing source", date: "2026-07-01", expiry: "2026-08-01" },
    ], { now: new Date("2026-07-09T00:00:00.000Z"), objective: "agent harnesses" });

    expect(report.survivors.map((c) => c.claim)).toEqual(["According to the benchmark, Vanta passed 10/10 checks"]);
    expect(report.verdicts.find((v) => v.claim === "Vanta is always the best")?.flags).toContain("skeptic: strong wording needs direct evidence");
    expect(report.verdicts.find((v) => v.claim === "Old fact")?.flags).toContain("stale: expiry has passed");
    expect(report.verdicts.find((v) => v.claim === "Missing source")?.flags).toContain("unsupported: missing source");
  });

  it("writes only surviving claims into the vault research page", async () => {
    const vault = join(tmpdir(), `vanta-receipts-${Date.now()}`);
    await mkdir(vault, { recursive: true });
    try {
      const report = assessReceipts([
        { claim: "Measured result survives", source: "https://example.com/good", date: "2026-07-01", expiry: "2026-08-01" },
        { claim: "Unsupported claim", date: "2026-07-01", expiry: "2026-08-01" },
      ], { now: new Date("2026-07-09T00:00:00.000Z"), objective: "receipt demo" });
      const rel = await writeReceiptVault(vault, report);
      const page = await readFile(join(vault, rel), "utf8");
      expect(page).toContain("Measured result survives");
      expect(page).toContain("Unsupported claim — unsupported: missing source");
    } finally {
      await rm(vault, { recursive: true, force: true });
    }
  });
});
