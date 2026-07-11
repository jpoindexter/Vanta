import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export function outcomeStatus(result) {
  return typeof result.outcomeVerification === "object" ? result.outcomeVerification.status : "pending";
}

export function deterministicOutcome(scenario, result) {
  if (!scenario?.checks?.length) return { status: "pending", verifier: scenario?.verify ?? "manual review required" };
  const output = String(result.outputTail ?? "").toLowerCase();
  const missing = scenario.checks.filter((check) => !output.includes(check.toLowerCase()));
  const passed = result.reliable && result.surfacePassed && result.guardPassed && missing.length === 0;
  return { status: passed ? "pass" : "fail", method: "deterministic-output-contract", verifier: scenario.verify, checkedAt: new Date().toISOString(), missing };
}

export async function verifyReceipt(pathValue, catalog) {
  const receiptPath = resolve(pathValue);
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  for (const result of receipt.results ?? []) {
    const scenario = catalog.scenarios.find((item) => item.id === result.id);
    const prior = typeof result.outcomeVerification === "object" ? result.outcomeVerification : undefined;
    result.outcomeVerification = result.turns?.length ? verifyMultiTurnResult(scenario, result) : deterministicOutcome(scenario, result);
    if (prior?.status && prior.status !== "pending") result.outcomeVerification.priorReview = prior;
    console.log(`verified ${result.id}: ${result.outcomeVerification.status}`);
  }
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
}

function verifyMultiTurnResult(scenario, result) {
  const definitions = scenario ? [scenario.firstTurn, ...(scenario.operatorReplies ?? [])] : [];
  for (const [index, turn] of (result.turns ?? []).entries()) updateTurn(turn, definitions[index], scenario);
  const complete = result.turns?.length === definitions.length;
  result.reliable = complete && result.turns.every((turn) => turn.stoppedReason === "done");
  result.guardPassed = complete && result.turns.every((turn) => turn.guardPassed);
  const passed = complete && result.turns.every((turn) => turn.passed);
  return { status: passed ? "pass" : "fail", method: "multi-turn-contract", checkedAt: new Date().toISOString() };
}

function updateTurn(turn, definition, scenario) {
  const output = String(turn.output ?? "").toLowerCase();
  const checks = definition?.checks ?? [];
  const forbidden = [...(scenario?.forbiddenPatterns ?? []), ...(definition?.forbiddenPatterns ?? [])];
  const toolText = (turn.tools ?? []).map((tool) => `${tool.name} ${tool.output ?? ""}`).join("\n");
  const haystack = `${output}\n${toolText}`.toLowerCase();
  turn.checks = checks;
  turn.missing = checks.filter((check) => !output.includes(check.toLowerCase()));
  turn.forbiddenHits = forbidden.filter((pattern) => haystack.includes(pattern.toLowerCase()));
  turn.boundaryPassed = turn.missing.length === 0;
  turn.guardPassed = turn.forbiddenHits.length === 0;
  turn.passed = turn.boundaryPassed && turn.guardPassed && turn.stoppedReason === "done";
}

export async function receiptStatus(dir, catalog) {
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
    executedScenarios: results.length, passedScenarios: passed.length,
    failedScenarios: results.filter((result) => outcomeStatus(result) === "fail").length,
    blockedScenarios: results.filter((result) => outcomeStatus(result) === "blocked").length,
    pendingScenarios: results.filter((result) => outcomeStatus(result) === "pending").length,
    categoryCoverage: passedCategories.size, gaps: categories.filter((category) => !passedCategories.has(category)),
  };
}

export async function exportPublic(pathValue, receiptDir, catalog) {
  const path = resolve(pathValue);
  const status = await receiptStatus(receiptDir, catalog);
  const proof = { manifestVersion: catalog.version, generatedAt: new Date().toISOString(), ...status };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  console.log(`public proof: ${path}`);
}
