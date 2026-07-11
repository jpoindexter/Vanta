#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "eval", "use-cases", "hermes-community-v1.json");
const args = process.argv.slice(2);

function value(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function has(flag) {
  return args.includes(flag);
}

function fail(message) {
  console.error(`usecase-eval: ${message}`);
  process.exitCode = 1;
}

function validate(catalog) {
  const errors = [];
  if (catalog.version !== 1) errors.push("version must be 1");
  if (!Array.isArray(catalog.scenarios)) errors.push("scenarios must be an array");
  const ids = new Set();
  const categories = new Set();
  for (const scenario of catalog.scenarios ?? []) {
    if (!scenario.id || ids.has(scenario.id)) errors.push(`missing or duplicate id: ${scenario.id ?? "<none>"}`);
    ids.add(scenario.id);
    categories.add(scenario.category);
    if (!scenario.instruction || !scenario.verify) errors.push(`${scenario.id}: instruction and verify are required`);
    if (!Array.isArray(scenario.expectedTools) || scenario.expectedTools.length === 0) errors.push(`${scenario.id}: expectedTools must be non-empty`);
    if (!Array.isArray(scenario.expectedArtifacts) || scenario.expectedArtifacts.length === 0) errors.push(`${scenario.id}: expectedArtifacts must be non-empty`);
    if (!Array.isArray(scenario.setup)) errors.push(`${scenario.id}: setup must be an array`);
    if (scenario.checks !== undefined && (!Array.isArray(scenario.checks) || scenario.checks.length === 0)) errors.push(`${scenario.id}: checks must be a non-empty array`);
    if (scenario.forbiddenPatterns !== undefined && !Array.isArray(scenario.forbiddenPatterns)) errors.push(`${scenario.id}: forbiddenPatterns must be an array`);
    if (!new Set(["route", "sandbox", "live"]).has(scenario.tier)) errors.push(`${scenario.id}: invalid tier ${scenario.tier}`);
  }
  if (categories.size !== 15) errors.push(`expected 15 categories, found ${categories.size}`);
  return errors;
}

function outcomeStatus(result) {
  return typeof result.outcomeVerification === "object" ? result.outcomeVerification.status : "pending";
}

function deterministicOutcome(scenario, result) {
  if (!scenario?.checks?.length) return { status: "pending", verifier: scenario?.verify ?? "manual review required" };
  const output = String(result.outputTail ?? "").toLowerCase();
  const missing = scenario.checks.filter((check) => !output.includes(check.toLowerCase()));
  const passed = result.reliable && result.surfacePassed && result.guardPassed && missing.length === 0;
  return {
    status: passed ? "pass" : "fail",
    method: "deterministic-output-contract",
    verifier: scenario.verify,
    checkedAt: new Date().toISOString(),
    missing,
  };
}

async function verifyReceipt(pathValue, catalog) {
  const receiptPath = resolve(pathValue);
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  for (const result of receipt.results ?? []) {
    const scenario = catalog.scenarios.find((item) => item.id === result.id);
    const prior = typeof result.outcomeVerification === "object" ? result.outcomeVerification : undefined;
    result.outcomeVerification = deterministicOutcome(scenario, result);
    if (prior?.status && prior.status !== "pending") result.outcomeVerification.priorReview = prior;
    console.log(`verified ${result.id}: ${result.outcomeVerification.status}`);
  }
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
}

async function receiptStatus(dir, catalog) {
  const latest = new Map();
  const files = (await readdir(dir).catch(() => [])).filter((name) => name.endsWith(".json")).sort();
  for (const name of files) {
    const receipt = JSON.parse(await readFile(join(dir, name), "utf8"));
    for (const result of receipt.results ?? []) latest.set(result.id, result);
  }
  const results = [...latest.values()];
  const passed = results.filter((result) => outcomeStatus(result) === "pass");
  const passedCategories = new Set(passed.map((result) => result.category));
  const categories = [...new Set(catalog.scenarios.map((scenario) => scenario.category))].sort();
  return {
    executedScenarios: results.length,
    passedScenarios: passed.length,
    failedScenarios: results.filter((result) => outcomeStatus(result) === "fail").length,
    blockedScenarios: results.filter((result) => outcomeStatus(result) === "blocked").length,
    pendingScenarios: results.filter((result) => outcomeStatus(result) === "pending").length,
    categoryCoverage: passedCategories.size,
    gaps: categories.filter((category) => !passedCategories.has(category)),
  };
}

async function exportPublic(pathValue, receiptDir, catalog) {
  const path = resolve(pathValue);
  const status = await receiptStatus(receiptDir, catalog);
  const proof = { manifestVersion: catalog.version, generatedAt: new Date().toISOString(), ...status };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  console.log(`public proof: ${path}`);
}

async function reviewReceipt(pathValue) {
  const scenarioId = value("--id");
  const outcome = value("--outcome");
  const note = value("--note");
  if (!scenarioId) throw new Error("--review requires --id <scenario-id>");
  if (!new Set(["pass", "fail", "blocked"]).has(outcome)) throw new Error("--outcome must be pass, fail, or blocked");
  if (!note?.trim()) throw new Error("--review requires --note <evidence>");
  const receiptPath = resolve(pathValue);
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  const result = receipt.results?.find((item) => item.id === scenarioId);
  if (!result) throw new Error(`receipt has no result with id ${scenarioId}`);
  result.outcomeVerification = {
    status: outcome,
    note: note.trim(),
    reviewedAt: new Date().toISOString(),
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  console.log(`reviewed ${scenarioId}: ${outcome} (${receiptPath})`);
}

function selectScenarios(catalog) {
  const id = value("--id");
  const category = value("--category")?.toLowerCase();
  const tier = value("--tier");
  return catalog.scenarios.filter((scenario) =>
    (!id || scenario.id === id) &&
    (!category || scenario.category.toLowerCase() === category) &&
    (!tier || scenario.tier === tier),
  );
}

function printScenarios(scenarios) {
  for (const scenario of scenarios) {
    console.log(`${scenario.id}\t${scenario.tier}\t${scenario.category}\t${scenario.verify}`);
  }
}

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

function redact(text) {
  return text
    .replace(/\b(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,})\b/g, "[REDACTED_TOKEN]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]{12,}/gi, "$1[REDACTED]")
    .slice(-4000);
}

function surfaceHit(output, tool) {
  const escaped = tool.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:→|tool\\(|tool[ :=])[^\\n]{0,80}\\b${escaped}\\b`, "i").test(output);
}

function runScenario(scenario, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(join(root, "run.sh"), ["run", scenario.instruction], {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const plain = stripAnsi(output);
      const hits = scenario.expectedTools.filter((tool) => surfaceHit(plain, tool));
      const forbiddenHits = (scenario.forbiddenPatterns ?? []).filter((pattern) => plain.toLowerCase().includes(pattern.toLowerCase()));
      const result = {
        id: scenario.id,
        sourceStoryId: scenario.sourceStoryId,
        category: scenario.category,
        tier: scenario.tier,
        startedAt: new Date(started).toISOString(),
        durationMs: Date.now() - started,
        exitCode: code,
        signal,
        reliable: code === 0 && signal === null,
        expectedTools: scenario.expectedTools,
        observedTools: hits,
        surfacePassed: hits.length > 0,
        forbiddenPatterns: scenario.forbiddenPatterns ?? [],
        forbiddenHits,
        guardPassed: forbiddenHits.length === 0,
        outputTail: redact(plain),
      };
      result.outcomeVerification = deterministicOutcome(scenario, result);
      resolve(result);
    });
  });
}

const reviewPath = value("--review");
if (reviewPath) {
  try {
    await reviewReceipt(reviewPath);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  process.exit(process.exitCode ?? 0);
}

const catalog = JSON.parse(await readFile(manifestPath, "utf8"));
const errors = validate(catalog);
const verifyPath = value("--verify-receipt");
const receiptDir = resolve(value("--receipt-dir") ?? join(root, ".vanta", "eval-runs", "use-cases"));
if (errors.length) {
  for (const error of errors) fail(error);
} else if (verifyPath) {
  await verifyReceipt(verifyPath, catalog);
} else if (value("--export-public")) {
  await exportPublic(value("--export-public"), receiptDir, catalog);
} else if (has("--status")) {
  const status = await receiptStatus(receiptDir, catalog);
  if (has("--json")) console.log(JSON.stringify(status, null, 2));
  else console.log(`${status.passedScenarios}/${status.executedScenarios} scenarios passed across ${status.categoryCoverage}/15 categories; gaps: ${status.gaps.join(", ") || "none"}`);
} else if (has("--validate")) {
  console.log(`valid: ${catalog.scenarios.length} scenarios across 15 categories`);
} else {
  const scenarios = selectScenarios(catalog);
  if (scenarios.length === 0) {
    fail("no scenarios matched the selected filters");
  } else if (!has("--run")) {
    printScenarios(scenarios);
    console.log("\nAdd --run to execute. Live scenarios also require --include-live.");
  } else {
    const timeoutMs = Number(value("--timeout-ms") ?? 180000);
    const runnable = scenarios.filter((scenario) => scenario.tier !== "live" || has("--include-live"));
    const skipped = scenarios.filter((scenario) => !runnable.includes(scenario));
    for (const scenario of skipped) console.log(`SKIP ${scenario.id}: live setup required (${scenario.setup.join(", ")})`);
    const results = [];
    for (const scenario of runnable) {
      console.log(`\nRUN ${scenario.id} [${scenario.tier}]`);
      results.push(await runScenario(scenario, timeoutMs));
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const receiptPath = join(root, ".vanta", "eval-runs", "use-cases", `${stamp}.json`);
    await mkdir(dirname(receiptPath), { recursive: true });
    await writeFile(receiptPath, `${JSON.stringify({ manifest: manifestPath, results, skipped: skipped.map((item) => item.id) }, null, 2)}\n`);
    console.log(`\nReceipt: ${receiptPath}`);
    if (results.some((result) => !result.reliable || !result.surfacePassed || !result.guardPassed)) process.exitCode = 1;
  }
}
