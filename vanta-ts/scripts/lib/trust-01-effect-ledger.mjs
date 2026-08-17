import { access, readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";

const REQUIRED_TEXT = [
  "actor", "account", "credential", "normalization", "policyDecision",
  "executor", "receipt", "compensation",
];

const SURFACE_PATTERNS = {
  browser: /\.(?:goto|screenshot)\s*\(/g,
  filesystem: /\b(?:writeFile|appendFile|rm|rename|mkdir|copyFile|symlink|chmod)\s*\(/g,
  process: /\b(?:spawn|execFile|fork)\s*\(|\bawait\s+exec\s*\(/g,
  network: /\b(?:fetch|googleFetch)\s*\(|\bthis\.http\s*\(/g,
  provider: /\.(?:complete|stream)\s*\(/g,
  sensor: /\b(?:captureLook|captureFrame|recordAudio)\s*\(/g,
  "tool-dispatch": /\b[A-Za-z_$][\w$]*\.execute\s*\(/g,
};

const DIRECT_TOOL_ADAPTERS = new Map([
  ["src/cli/release-proofs-cmd.ts", "Read-only Gmail search proof adapter; it cannot mutate provider state"],
  ["src/effects/tool-effect-gateway.ts", "Authoritative ordinary-tool executor"],
  ["src/factory/run-stages.ts", "Protected factory-injected stage executor; source is explicitly out of TRUST-01 scope"],
  ["src/heartbeat/runtime.ts", "Injected heartbeat lifecycle callback; not a registered Tool dispatch"],
  ["src/plugins/context.ts", "Plugin error/provenance wrapper; outer dispatcher remains the policy boundary"],
  ["src/runner/loop.ts", "Injected durable-job executor; not a registered Tool dispatch"],
  ["src/schema/controlled-commit.ts", "Controlled kernel protocol executor with its own authority boundary"],
  ["src/schema/release-proof-task-pipeline.ts", "Certified schema test driver; not a registered Tool dispatch"],
]);

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

export function inspectEffectSource(source, code) {
  const executable = code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const primitives = {};
  const evidence = [];
  for (const [kind, pattern] of Object.entries(SURFACE_PATTERNS)) {
    pattern.lastIndex = 0;
    const matches = [...executable.matchAll(pattern)];
    if (!matches.length) continue;
    primitives[kind] = matches.length;
    for (const match of matches) evidence.push(`${kind}:${match[0]}`);
  }
  if (!evidence.length) return null;
  return {
    source,
    primitives,
    effectSha256: createHash("sha256").update(code).digest("hex"),
  };
}

const SURFACE_CLASSIFICATIONS = new Set([
  "authoritative-gateway",
  "mediated-adapter",
  "mediated-host",
  "mediated-tool",
  "protected-out-of-scope",
  "trusted-infrastructure",
]);

function defaultSurfaceClassification(source, primitives) {
  if (source === "src/effects/tool-effect-gateway.ts") return "authoritative-gateway";
  if (source.startsWith("src/factory/")) return "protected-out-of-scope";
  if (source.startsWith("src/tools/")) return "mediated-tool";
  if (/^src\/(agent|agents|desktop|gateway|mcp|plugins|schedule|webhook-workflows|workflow)\//.test(source)) return "mediated-host";
  if (primitives.process || primitives.network) return "mediated-adapter";
  return "trusted-infrastructure";
}

function surfaceDefaults(source, classification, primitives) {
  const mediated = classification.startsWith("mediated");
  const entry = {
    classification,
    actor: mediated ? "Registered Vanta tool or bounded host adapter" : "Vanta trusted infrastructure",
    account: "Local project or explicitly configured provider account named by the owning callsite",
    credential: "Credential resolution remains in the owning provider or safe child environment; inventory stores no values",
    normalization: "The complete source file is SHA-256 pinned; consequential tool calls additionally bind normalized arguments",
    policyDecision: mediated ? "The authoritative effect gateway or an explicitly reviewed host boundary decides before execution" : "Not model-dispatched directly; caller authority and scoped storage invariants apply",
    executor: source,
    receipt: mediated ? "Canonical effect journal and WorkItem receipt, or the named host receipt for an explicit adapter" : "Owning infrastructure journal or atomic state record",
    compensation: "No blind consequential retry; uncertainty remains visible and provider-specific compensation is required where available",
    bypassTests: ["scripts/lib/trust-01-effect-ledger.node-test.mjs"],
  };
  if (classification === "mediated-adapter" || primitives["tool-dispatch"]) {
    Object.assign(entry, {
      provenance: `Owning gateway/host and exact source path ${source}`,
      measurement: "Primitive kind/count plus normalized payload or argument SHA-256",
      cutoff: "Caller authority, kernel decision, operation id, and bounded target determine execution lifetime",
      rollback: "Provider-specific compensation or explicit needs-human settlement; never a blind retry",
      policyBoundary: false,
    });
  }
  return entry;
}

export async function buildEffectSurfaceInventory(root) {
  const files = await sourceFiles(join(root, "src"));
  const entries = [];
  for (const file of files) {
    const source = relative(root, file);
    const inspected = inspectEffectSource(source, await readFile(file, "utf8"));
    if (!inspected) continue;
    const classification = defaultSurfaceClassification(source, inspected.primitives);
    entries.push({ ...inspected, ...surfaceDefaults(source, classification, inspected.primitives) });
  }
  return { version: 1, entries: entries.sort((left, right) => left.source.localeCompare(right.source)) };
}

function requireSurfaceIdentity(entry) {
  if (!entry || typeof entry !== "object") throw new Error("effect surface entry must be an object");
  if (typeof entry.source !== "string" || !entry.source.startsWith("src/")) throw new Error("effect surface source is required");
  if (!/^[a-f0-9]{64}$/.test(entry.effectSha256 ?? "")) throw new Error(`${entry.source} effectSha256 is required`);
  if (!entry.primitives || typeof entry.primitives !== "object" || !Object.keys(entry.primitives).length) throw new Error(`${entry.source} primitives are required`);
  if (!SURFACE_CLASSIFICATIONS.has(entry.classification)) throw new Error(`${entry.source} classification is invalid`);
}

function requireTextFields(entry, keys) {
  for (const key of keys) {
    if (typeof entry[key] !== "string" || !entry[key].trim()) throw new Error(`${entry.source} ${key} is required`);
  }
}

function validateSurfaceAdapter(entry) {
  if (entry.classification !== "mediated-adapter" && !entry.primitives["tool-dispatch"]) return;
  requireTextFields(entry, ["provenance", "measurement", "cutoff", "rollback"]);
  if (entry.policyBoundary !== false) throw new Error(`${entry.source} adapter must not become a policy boundary`);
}

function validateSurfaceEntry(entry) {
  requireSurfaceIdentity(entry);
  requireTextFields(entry, [...REQUIRED_TEXT, "classification"]);
  if (!Array.isArray(entry.bypassTests) || !entry.bypassTests.length) throw new Error(`${entry.source} bypassTests are required`);
  validateSurfaceAdapter(entry);
}

export async function validateEffectSurfaceInventory(root, inventory) {
  if (inventory?.version !== 1 || !Array.isArray(inventory.entries)) throw new Error("effect surface inventory version 1 entries are required");
  inventory.entries.forEach(validateSurfaceEntry);
  const actual = await buildEffectSurfaceInventory(root);
  const actualBySource = new Map(actual.entries.map((entry) => [entry.source, entry]));
  const listedBySource = new Map(inventory.entries.map((entry) => [entry.source, entry]));
  if (listedBySource.size !== inventory.entries.length) throw new Error("effect surface inventory has duplicate sources");
  const missing = actual.entries.filter((entry) => !listedBySource.has(entry.source)).map((entry) => entry.source);
  const stale = inventory.entries.filter((entry) => !actualBySource.has(entry.source)).map((entry) => entry.source);
  if (missing.length) throw new Error(`missing effect surface source: ${missing.join(", ")}`);
  if (stale.length) throw new Error(`stale effect surface source: ${stale.join(", ")}`);
  for (const listed of inventory.entries) {
    const current = actualBySource.get(listed.source);
    if (current.effectSha256 !== listed.effectSha256 || JSON.stringify(current.primitives) !== JSON.stringify(listed.primitives)) {
      throw new Error(`changed effect surface source: ${listed.source}`);
    }
    for (const testPath of listed.bypassTests) await access(join(root, testPath)).catch(() => { throw new Error(`${listed.source} bypass test is missing: ${testPath}`); });
  }
  const direct = await validateDirectExecutors(root);
  return {
    ok: true,
    sources: actual.entries.length,
    primitiveCalls: actual.entries.reduce((sum, entry) => sum + Object.values(entry.primitives).reduce((a, b) => a + b, 0), 0),
    directExecutors: direct.directExecutors.length,
    unmediatedEffects: direct.unmediatedEffects,
  };
}

async function productionDirectToolExecutors(root) {
  const files = await sourceFiles(join(root, "src"));
  const matched = [];
  for (const file of files) {
    const executable = (await readFile(file, "utf8"))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    SURFACE_PATTERNS["tool-dispatch"].lastIndex = 0;
    if (SURFACE_PATTERNS["tool-dispatch"].test(executable)) matched.push(relative(root, file));
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

async function validateLedgerFiles(root, entries) {
  for (const entry of entries) {
    await access(join(root, entry.source)).catch(() => { throw new Error(`missing effect source ${entry.source}`); });
    for (const testPath of entry.bypassTests) {
      await access(join(root, testPath)).catch(() => { throw new Error(`${entry.source} bypass test is missing: ${testPath}`); });
    }
  }
}

function compareLedgerSources(listed, production) {
  const missingSources = production.filter((source) => !listed.includes(source));
  const staleSources = listed.filter((source) => !production.includes(source));
  if (missingSources.length) throw new Error(`missing production effect source: ${missingSources.join(", ")}`);
  if (staleSources.length) throw new Error(`stale effect source: ${staleSources.join(", ")}`);
  return { missingSources, staleSources };
}

async function validateDirectExecutors(root) {
  const directExecutors = await productionDirectToolExecutors(root);
  const unknown = directExecutors.filter((source) => !DIRECT_TOOL_ADAPTERS.has(source));
  if (unknown.length) throw new Error(`unmediated direct tool executor: ${unknown.join(", ")}`);
  for (const [source, rationale] of DIRECT_TOOL_ADAPTERS) {
    if (!directExecutors.includes(source)) throw new Error(`stale direct tool adapter: ${source}`);
    if (!rationale.trim()) throw new Error(`direct tool adapter rationale missing: ${source}`);
  }
  return { directExecutors, unmediatedEffects: unknown.length };
}

export async function validateEffectLedger(root, ledger) {
  if (ledger?.version !== 1 || !Array.isArray(ledger.entries)) throw new Error("effect ledger version 1 entries are required");
  ledger.entries.forEach(validateEntryShape);
  const listed = ledger.entries.map((entry) => entry.source).sort();
  if (new Set(listed).size !== listed.length) throw new Error("effect ledger has duplicate sources");
  await validateLedgerFiles(root, ledger.entries);
  const production = await productionEffectSources(root);
  const { missingSources, staleSources } = compareLedgerSources(listed, production);
  const direct = await validateDirectExecutors(root);
  return {
    ok: true,
    productionSources: production.length,
    effectKinds: new Set(ledger.entries.flatMap((entry) => entry.effectKinds)).size,
    missingSources,
    staleSources,
    directExecutors: direct.directExecutors.length,
    unmediatedEffects: direct.unmediatedEffects,
  };
}
