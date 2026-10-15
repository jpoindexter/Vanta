import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateTrust04HostLedger } from "./trust-04-host-ledger.mjs";

const root = resolve(import.meta.dirname, "../..");
const ledgerPath = resolve(root, "../docs/trust-04-host-ledger-2026-08-02.json");

async function ledger() {
  return JSON.parse(await readFile(ledgerPath, "utf8"));
}

test("the ledger has the exact contract and all seven supported hosts", async () => {
  const result = await validateTrust04HostLedger(root, await ledger());
  assert.deepEqual(result.hosts, ["cli", "desktop", "goal-progress", "jobs", "memory", "messaging", "tui"]);
  assert.equal(result.ok, true);
  assert.equal(result.roadmapState, "shipped");
  assert.equal(result.representativePaths, 6);
});

test("host, lifecycle, projection, disposition, and evidence mutations fail closed", async () => {
  const value = await ledger();
  await assert.rejects(
    () => validateTrust04HostLedger(root, { ...value, hosts: value.hosts.slice(1) }),
    /supported hosts/,
  );
  await assert.rejects(
    () => validateTrust04HostLedger(root, { ...value, contract: { ...value.contract, states: value.contract.states.slice(1) } }),
    /lifecycle states/,
  );
  await assert.rejects(
    () => validateTrust04HostLedger(root, { ...value, contract: { ...value.contract, projections: [...value.contract.projections, "Finished"] } }),
    /projections/,
  );
  await assert.rejects(
    () => validateTrust04HostLedger(root, { ...value, contract: { ...value.contract, dispositions: value.contract.dispositions.filter((item) => item !== "expired") } }),
    /dispositions/,
  );
  await assert.rejects(
    () => validateTrust04HostLedger(root, {
      ...value,
      representativePaths: value.representativePaths.map((entry, index) => index === 0
        ? { ...entry, tests: ["src/missing.test.ts"] }
        : entry),
    }),
    /evidence path/,
  );
  await assert.rejects(
    () => validateTrust04HostLedger(root, {
      ...value,
      hosts: value.hosts.map((entry, index) => index === 0
        ? { ...entry, contractBoundary: "src/definitely-missing.ts#missing" }
        : entry),
    }),
    /contract boundary/,
  );
});
