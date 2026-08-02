import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateEffectLedger } from "./trust-01-effect-ledger.mjs";

const root = resolve(import.meta.dirname, "../..");
const ledgerPath = resolve(root, "../docs/trust-01-effect-ledger-2026-08-02.json");

async function ledger() {
  return JSON.parse(await readFile(ledgerPath, "utf8"));
}

test("the ledger covers every production executeEffect callsite", async () => {
  const result = await validateEffectLedger(root, await ledger());
  assert.equal(result.ok, true);
  assert.equal(result.missingSources.length, 0);
  assert.equal(result.staleSources.length, 0);
  assert.ok(result.productionSources >= 14);
});

test("missing and incomplete entries fail closed", async () => {
  const value = await ledger();
  await assert.rejects(() => validateEffectLedger(root, { ...value, entries: value.entries.slice(1) }), /missing production effect source/);
  await assert.rejects(() => validateEffectLedger(root, {
    ...value,
    entries: value.entries.map((entry, index) => index === 0 ? { ...entry, credential: "" } : entry),
  }), /credential/);
  await assert.rejects(() => validateEffectLedger(root, {
    ...value,
    entries: value.entries.map((entry, index) => index === 0 ? { ...entry, bypassTests: ["src/missing.test.ts"] } : entry),
  }), /bypass test/);
});
