import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const runner = join(repoRoot, "scripts", "usecase-eval.mjs");

describe("use-case receipt review", () => {
  it("records a reviewer verdict and note on one scenario result", () => {
    const dir = mkdtempSync(join(tmpdir(), "vanta-usecase-review-"));
    const receipt = join(dir, "receipt.json");
    writeFileSync(receipt, `${JSON.stringify({ results: [{ id: "example", outcomeVerification: "manual-required" }] })}\n`);

    execFileSync(process.execPath, [
      runner,
      "--review", receipt,
      "--id", "example",
      "--outcome", "fail",
      "--note", "The answer contradicted the tracked installer.",
    ], { cwd: repoRoot, stdio: "pipe" });

    const reviewed = JSON.parse(readFileSync(receipt, "utf8"));
    expect(reviewed.results[0].outcomeVerification).toMatchObject({
      status: "fail",
      note: "The answer contradicted the tracked installer.",
    });
    expect(reviewed.results[0].outcomeVerification.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
