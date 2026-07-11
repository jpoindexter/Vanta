import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "../../..");
const script = join(repoRoot, "scripts", "usecase-eval.mjs");
let root: string;

beforeEach(async () => {
  root = join(tmpdir(), `vanta-usecase-eval-${Date.now()}-${Math.random()}`);
  await mkdir(root, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("usecase eval receipt verification", () => {
  it("deterministically verifies a recorded output contract and reports history", async () => {
    const receiptPath = join(root, "run.json");
    await writeFile(receiptPath, JSON.stringify({
      results: [{
        id: "general-capability-start", category: "General", tier: "route",
        reliable: true, surfacePassed: true, guardPassed: true,
        outputTail: "Ready to use right now. Needs setup. Recommended ready workflow. Choose one before I start.",
        outcomeVerification: { status: "pending" },
      }],
    }));

    const verified = await exec("node", [script, "--verify-receipt", receiptPath], { cwd: repoRoot });
    expect(verified.stdout).toContain("verified general-capability-start: pass");
    expect(JSON.parse(await readFile(receiptPath, "utf8")).results[0].outcomeVerification).toMatchObject({ status: "pass", method: "deterministic-output-contract" });

    const status = await exec("node", [script, "--status", "--receipt-dir", root, "--json"], { cwd: repoRoot });
    const summary = JSON.parse(status.stdout);
    expect(summary).toMatchObject({ executedScenarios: 1, passedScenarios: 1, categoryCoverage: 1 });
    expect(summary.gaps).toContain("Dev Workflow");

    const publicPath = join(root, "public", "proof.json");
    await exec("node", [script, "--export-public", publicPath, "--receipt-dir", root], { cwd: repoRoot });
    const publicProof = JSON.parse(await readFile(publicPath, "utf8"));
    expect(publicProof).toMatchObject({ manifestVersion: 1, executedScenarios: 1, passedScenarios: 1 });
    expect(JSON.stringify(publicProof)).not.toContain("outputTail");
  });

  it("fails deterministic verification when required evidence is absent", async () => {
    const receiptPath = join(root, "failed.json");
    await writeFile(receiptPath, JSON.stringify({ results: [{
      id: "general-capability-start", category: "General", tier: "route",
      reliable: true, surfacePassed: true, guardPassed: true, outputTail: "Ready now.",
      outcomeVerification: { status: "pending" },
    }] }));

    const run = await exec("node", [script, "--verify-receipt", receiptPath], { cwd: repoRoot });
    expect(run.stdout).toContain("verified general-capability-start: fail");
    expect(JSON.parse(await readFile(receiptPath, "utf8")).results[0].outcomeVerification.missing).toContain("Needs setup");
  });
});
