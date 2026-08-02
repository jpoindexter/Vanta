import { access, readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const REQUIRED_TEXT = [
  "actor", "account", "credential", "normalization", "policyDecision",
  "executor", "receipt", "compensation",
];

async function sourceFiles(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = join(path, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name.includes(".test.")) return [];
    return [target];
  }));
  return nested.flat();
}

async function productionEffectSources(root) {
  const files = await sourceFiles(join(root, "src"));
  const matched = [];
  for (const file of files) {
    if (/\bexecuteEffect\s*\(/.test(await readFile(file, "utf8"))) matched.push(relative(root, file));
  }
  return matched.sort();
}

function validateEntryShape(entry) {
  if (!entry || typeof entry !== "object") throw new Error("effect ledger entry must be an object");
  if (entry.classification !== "mediated") throw new Error(`${entry.source ?? "entry"} classification must be mediated`);
  if (typeof entry.source !== "string" || !entry.source.startsWith("src/") || !entry.source.endsWith(".ts")) {
    throw new Error("effect ledger source must be a production TypeScript path");
  }
  if (!Array.isArray(entry.effectKinds) || entry.effectKinds.length === 0 || entry.effectKinds.some((kind) => typeof kind !== "string" || !kind)) {
    throw new Error(`${entry.source} effectKinds must be non-empty strings`);
  }
  for (const key of REQUIRED_TEXT) {
    if (typeof entry[key] !== "string" || !entry[key].trim()) throw new Error(`${entry.source} ${key} is required`);
  }
  if (!Array.isArray(entry.bypassTests) || entry.bypassTests.length === 0) throw new Error(`${entry.source} bypassTests are required`);
}

export async function validateEffectLedger(root, ledger) {
  if (ledger?.version !== 1 || !Array.isArray(ledger.entries)) throw new Error("effect ledger version 1 entries are required");
  for (const entry of ledger.entries) validateEntryShape(entry);
  const listed = ledger.entries.map((entry) => entry.source).sort();
  if (new Set(listed).size !== listed.length) throw new Error("effect ledger has duplicate sources");
  for (const entry of ledger.entries) {
    await access(join(root, entry.source)).catch(() => { throw new Error(`missing effect source ${entry.source}`); });
    for (const testPath of entry.bypassTests) {
      await access(join(root, testPath)).catch(() => { throw new Error(`${entry.source} bypass test is missing: ${testPath}`); });
    }
  }
  const production = await productionEffectSources(root);
  const missingSources = production.filter((source) => !listed.includes(source));
  const staleSources = listed.filter((source) => !production.includes(source));
  if (missingSources.length) throw new Error(`missing production effect source: ${missingSources.join(", ")}`);
  if (staleSources.length) throw new Error(`stale effect source: ${staleSources.join(", ")}`);
  return {
    ok: true,
    productionSources: production.length,
    effectKinds: new Set(ledger.entries.flatMap((entry) => entry.effectKinds)).size,
    missingSources,
    staleSources,
  };
}
