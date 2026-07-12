#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deterministicOutcome, exportPublic, outcomeStatus, receiptStatus, verifyReceipt } from "./usecase-eval-receipts.mjs";

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
    if (scenario.expectedToolsMode !== undefined && scenario.expectedToolsMode !== "optional") errors.push(`${scenario.id}: expectedToolsMode must be optional when set`);
    if (!Array.isArray(scenario.expectedArtifacts) || scenario.expectedArtifacts.length === 0) errors.push(`${scenario.id}: expectedArtifacts must be non-empty`);
    if (!Array.isArray(scenario.setup)) errors.push(`${scenario.id}: setup must be an array`);
    if (scenario.checks !== undefined && (!Array.isArray(scenario.checks) || scenario.checks.length === 0)) errors.push(`${scenario.id}: checks must be a non-empty array`);
    if (scenario.operatorReplies !== undefined) validateScriptedTurns(scenario, errors);
    if (scenario.forbiddenPatterns !== undefined && !Array.isArray(scenario.forbiddenPatterns)) errors.push(`${scenario.id}: forbiddenPatterns must be an array`);
    if (!new Set(["route", "sandbox", "live"]).has(scenario.tier)) errors.push(`${scenario.id}: invalid tier ${scenario.tier}`);
  }
  if (categories.size !== 15) errors.push(`expected 15 categories, found ${categories.size}`);
  return errors;
}

function validateScriptedTurns(scenario, errors) {
  if (!scenario.firstTurn || !Array.isArray(scenario.firstTurn.checks)) errors.push(`${scenario.id}: scripted scenario requires firstTurn checks`);
  if (!Array.isArray(scenario.operatorReplies) || scenario.operatorReplies.length === 0) errors.push(`${scenario.id}: operatorReplies must be non-empty`);
  for (const [index, turn] of (scenario.operatorReplies ?? []).entries()) {
    if (!turn.reply || !turn.boundary || !Array.isArray(turn.checks) || turn.checks.length === 0) errors.push(`${scenario.id}: invalid operator reply ${index + 1}`);
  }
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

function signalProcessTree(child, signal) {
  try {
    if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    // The process may have exited between the timeout and signal delivery.
  }
}

function armTimeout(child, timeoutMs) {
  let hardTimer;
  const softTimer = setTimeout(() => {
    signalProcessTree(child, "SIGTERM");
    hardTimer = setTimeout(() => signalProcessTree(child, "SIGKILL"), 5000);
  }, timeoutMs);
  return () => {
    clearTimeout(softTimer);
    if (hardTimer) clearTimeout(hardTimer);
  };
}

function runScenario(scenario, timeoutMs) {
  if (scenario.operatorReplies?.length) return runMultiTurnScenario(scenario, timeoutMs);
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(join(root, "run.sh"), ["run", scenario.instruction], {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
    const clearTimer = armTimeout(child, timeoutMs);
    child.on("close", (code, signal) => {
      clearTimer();
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

function runMultiTurnScenario(scenario, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const temp = join(root, ".vanta", "eval-runs", "use-cases", `.multiturn-${scenario.id}-${started}.json`);
    const child = spawn(join(root, "run.sh"), ["story-eval", "--manifest", manifestPath, "--id", scenario.id, "--out", temp], {
      cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32",
    });
    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    const clearTimer = armTimeout(child, timeoutMs);
    child.on("close", async (code, signal) => {
      clearTimer();
      try {
        const receipt = JSON.parse(await readFile(temp, "utf8"));
        const result = receipt.results[0];
        resolve({ ...result, startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, exitCode: code, signal });
      } catch (error) {
        resolve(failedMultiTurnResult(scenario, started, code, signal, error));
      } finally {
        await rm(temp, { force: true });
      }
    });
  });
}

function failedMultiTurnResult(scenario, started, code, signal, error) {
  return {
    id: scenario.id, sourceStoryId: scenario.sourceStoryId, category: scenario.category, tier: scenario.tier,
    startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, exitCode: code, signal,
    reliable: false, expectedTools: scenario.expectedTools, observedTools: [], surfacePassed: false,
    guardPassed: false, outcomeVerification: { status: "fail", method: "multi-turn-contract", error: String(error) }, outputTail: "",
  };
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
    if (results.some((result) => !result.reliable || !result.surfacePassed || !result.guardPassed || outcomeStatus(result) === "fail")) process.exitCode = 1;
  }
}
