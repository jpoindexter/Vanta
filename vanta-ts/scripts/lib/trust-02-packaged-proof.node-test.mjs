import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDesktopBoundaryResults,
  assertReceiptCorpus,
  parseJsonLines,
} from "./trust-02-packaged-proof.mjs";

test("desktop boundary proof requires every hostile request to fail closed", () => {
  assert.equal(assertDesktopBoundaryResults({
    hostile: [
      { label: "missing token", status: 403 },
      { label: "wrong token", status: 403 },
      { label: "hostile origin", status: 403 },
    ],
    trusted: [{ label: "trusted renderer", status: 200 }],
  }), true);

  assert.throws(() => assertDesktopBoundaryResults({
    hostile: [{ label: "hostile mutation", status: 200 }],
    trusted: [{ label: "trusted renderer", status: 200 }],
  }), /hostile mutation unexpectedly returned 200/);
});

test("receipt proof requires pending and settled transitions without secret material", () => {
  const toolEffects = [
    { toolCallId: "credential-read", tool: "read_file", transition: "pending" },
    { toolCallId: "credential-read", tool: "read_file", transition: "settled", disposition: "none" },
    { toolCallId: "hook-write", tool: "write_file", transition: "pending" },
    { toolCallId: "hook-write", tool: "write_file", transition: "settled", disposition: "denied" },
  ];
  const receipts = [
    { workItemId: "session:credential-read", action: "read_file", disposition: "none" },
    { workItemId: "session:hook-write", action: "write_file", disposition: "denied" },
  ];
  assert.equal(assertReceiptCorpus({
    toolEffects,
    receipts,
    requiredToolCallIds: ["credential-read", "hook-write"],
    forbiddenValues: ["PROJECT_SECRET_VALUE", "AUDIT_SIGNING_SECRET"],
  }), true);

  assert.throws(() => assertReceiptCorpus({
    toolEffects: [...toolEffects, { toolCallId: "leak", tool: "read_file", transition: "settled", output: "PROJECT_SECRET_VALUE" }],
    receipts,
    requiredToolCallIds: ["credential-read"],
    forbiddenValues: ["PROJECT_SECRET_VALUE"],
  }), /forbidden value reached retained receipt corpus/);
});

test("JSONL parser rejects malformed retained evidence", () => {
  assert.deepEqual(parseJsonLines('{"ok":true}\n\n'), [{ ok: true }]);
  assert.throws(() => parseJsonLines('{"ok":true}\nnot-json\n'), /invalid JSONL line 2/);
});
