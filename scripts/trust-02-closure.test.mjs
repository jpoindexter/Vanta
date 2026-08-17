import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOrderDocument } from "./build-order.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const roadmap = JSON.parse(readFileSync(join(repoRoot, "roadmap.json"), "utf8"));

function readReceipt() {
  try {
    return JSON.parse(
      readFileSync(join(repoRoot, "docs", "trust-02-closure-receipt-2026-08-02.json"), "utf8"),
    );
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

test("TRUST-02 closure removes the card from the open queue and retains executed evidence", () => {
  const trust = roadmap.items.find((item) => item.id === "TRUST-02");
  const buildOrder = buildOrderDocument(roadmap);
  const receipt = readReceipt();

  assert.equal(trust?.status, "shipped");
  assert.doesNotMatch(buildOrder, /TRUST-02 —/);
  assert.doesNotMatch(buildOrder, /TRUST-04 —/);
  assert.doesNotMatch(buildOrder, /TRUST-01 —/);
  assert.match(buildOrder, /OP-01 —/);
  assert.equal(receipt?.roadmapId, "TRUST-02");
  assert.equal(receipt?.roadmapState, "shipped");
  assert.equal(receipt?.proof?.exitCode, 0);
  assert.equal(receipt?.proof?.hostileDesktopRequestsDenied, 9);
  assert.equal(receipt?.proof?.secretExposure, 0);
  assert.equal(receipt?.proof?.secretMutation, 0);
  assert.equal(receipt?.proof?.sameRunHookActivation, false);
  assert.equal(receipt?.proof?.restartHookActivation, true);
  assert.deepEqual(receipt?.doneCriteria, {
    auditEvidenceOutsideAgentScope: "executed",
    completePayloadDeniedOrExactApproved: "executed",
    controlPlaneAndCredentialAttemptsMediated: "executed",
    exactOriginAndAdversarialPathsEndToEnd: "executed",
    hookActivationRestartBounded: "executed",
    retainedReceipts: "executed",
    secretExposureAbsent: "executed",
  });
});
