import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  inspectEffectSource,
  validateEffectLedger,
  validateEffectSurfaceInventory,
} from "./trust-01-effect-ledger.mjs";

const root = resolve(import.meta.dirname, "../..");
const ledgerPath = resolve(root, "../docs/trust-01-effect-ledger-2026-08-02.json");
const surfacePath = resolve(root, "../docs/trust-01-effect-surface-inventory-2026-08-02.json");

async function ledger() {
  return JSON.parse(await readFile(ledgerPath, "utf8"));
}

async function surface() {
  return JSON.parse(await readFile(surfacePath, "utf8"));
}

test("the ledger covers every production executeEffect callsite", async () => {
  const result = await validateEffectLedger(root, await ledger());
  assert.equal(result.ok, true);
  assert.equal(result.missingSources.length, 0);
  assert.equal(result.staleSources.length, 0);
  assert.ok(result.productionSources >= 14);
});

test("the checked surface covers every production effect primitive", async () => {
  const result = await validateEffectSurfaceInventory(root, await surface());
  assert.equal(result.ok, true);
  assert.ok(result.sources > 300);
  assert.ok(result.primitiveCalls > 500);
});

test("surface mutation and hidden direct-dispatch patterns fail closed", async () => {
  const inspected = inspectEffectSource("src/agent/hidden-bypass.ts", `
    await tool.execute(args, ctx);
    await sendChatTool.execute(args, ctx);
    await writeFile(target, payload);
    await page.goto(url);
    await page.screenshot({ path });
    await provider.complete(messages, tools);
    await this.http(url);
    await captureLook({ mode: "screen" });
  `);
  assert.deepEqual(inspected.primitives, {
    browser: 2,
    filesystem: 1,
    network: 1,
    provider: 1,
    sensor: 1,
    "tool-dispatch": 2,
  });
  assert.match(inspected.effectSha256, /^[a-f0-9]{64}$/);

  const value = await surface();
  await assert.rejects(() => validateEffectSurfaceInventory(root, {
    ...value,
    entries: value.entries.map((entry, index) => index === 0
      ? { ...entry, effectSha256: "0".repeat(64) }
      : entry),
  }), /changed effect surface source/);
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
