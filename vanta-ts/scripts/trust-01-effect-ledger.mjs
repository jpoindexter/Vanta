import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateEffectLedger, validateEffectSurfaceInventory } from "./lib/trust-01-effect-ledger.mjs";

const root = process.cwd();
const path = resolve(root, "../docs/trust-01-effect-ledger-2026-08-02.json");
const ledger = JSON.parse(await readFile(path, "utf8"));
const surfacePath = resolve(root, "../docs/trust-01-effect-surface-inventory-2026-08-02.json");
const surface = JSON.parse(await readFile(surfacePath, "utf8"));
console.log(JSON.stringify({
  ledger: await validateEffectLedger(root, ledger),
  surface: await validateEffectSurfaceInventory(root, surface),
}));
