import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildEffectSurfaceInventory } from "./lib/trust-01-effect-ledger.mjs";

const root = process.cwd();
const target = resolve(root, "../docs/trust-01-effect-surface-inventory-2026-08-02.json");
const inventory = await buildEffectSurfaceInventory(root);
await writeFile(target, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ok: true, target, sources: inventory.entries.length }));
