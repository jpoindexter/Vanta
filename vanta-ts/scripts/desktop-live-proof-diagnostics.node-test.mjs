import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LiveProofMismatchError, assertLiveProof, redactDiagnosticValue, writeDiagnosticBundle } from "./lib/desktop-live-proof-diagnostics.mjs";

const marker = "VANTA_DESKTOP_LIVE_READ_fixture";

function evidence(overrides = {}) {
  return {
    rawResponse: { finalText: marker },
    persistedSession: { messages: [{ role: "assistant", content: marker }] },
    renderedText: marker,
    status: { provider: "codex", model: "gpt-test", root: "/tmp/project" },
    projectRoot: "/tmp/project",
    approvalState: null,
    startupLogs: [],
    ...overrides,
  };
}

test("asserts API, persistence, DOM, provider, model, root, and approval independently", () => {
  assert.equal(assertLiveProof(evidence(), marker), true);
  assert.throws(
    () => assertLiveProof(evidence({ renderedText: "mutated" }), marker),
    (error) => error instanceof LiveProofMismatchError && error.failures.includes("rendered DOM does not contain marker"),
  );
});

test("redacts structured and inline credentials", () => {
  assert.deepEqual(redactDiagnosticValue({ apiKey: "sk-secret-value", detail: "Bearer abcdefghijklmnop", safe: "codex" }), {
    apiKey: "[REDACTED]",
    detail: "[REDACTED]",
    safe: "codex",
  });
});

test("writes a redacted diagnostic bundle and screenshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "vanta-live-proof-diagnostics-"));
  try {
    const result = await writeDiagnosticBundle({
      artifactRoot: root,
      label: "mutation",
      evidence: evidence({ status: { provider: "codex", model: "gpt-test", root: "/tmp/project", token: "secret" } }),
      error: new Error("rendered marker missing"),
      screenshot: async (path) => { await import("node:fs/promises").then(({ writeFile }) => writeFile(path, "png")); },
    });
    const bundle = JSON.parse(await readFile(result.bundlePath, "utf8"));
    assert.equal(bundle.evidence.status.token, "[REDACTED]");
    assert.equal(await readFile(result.screenshotPath, "utf8"), "png");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
