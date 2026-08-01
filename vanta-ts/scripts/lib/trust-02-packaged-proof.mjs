import assert from "node:assert/strict";

export function assertDesktopBoundaryResults({ hostile, trusted }) {
  for (const result of hostile) {
    assert.equal(result.status, 403, `${result.label} unexpectedly returned ${result.status}`);
  }
  for (const result of trusted) {
    assert.equal(result.status, 200, `${result.label} unexpectedly returned ${result.status}`);
  }
  return true;
}

export function parseJsonLines(text) {
  return text.split("\n").flatMap((line, index) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line)];
    } catch (error) {
      throw new Error(`invalid JSONL line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

export function assertReceiptCorpus({ toolEffects, receipts, requiredToolCallIds, forbiddenValues }) {
  const retained = JSON.stringify({ toolEffects, receipts });
  for (const value of forbiddenValues) {
    assert.ok(!retained.includes(value), "forbidden value reached retained receipt corpus");
  }
  for (const id of requiredToolCallIds) {
    const transitions = toolEffects.filter((record) => record.toolCallId === id).map((record) => record.transition);
    assert.ok(transitions.includes("pending"), `missing pending transition for ${id}`);
    assert.ok(transitions.includes("settled"), `missing settled transition for ${id}`);
    assert.ok(receipts.some((record) => String(record.workItemId ?? "").endsWith(`:${id}`)), `missing receipt for ${id}`);
  }
  return true;
}
