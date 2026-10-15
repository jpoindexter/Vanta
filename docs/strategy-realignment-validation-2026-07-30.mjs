#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tsImport } from "../vanta-ts/node_modules/tsx/dist/esm/api/index.mjs";
import {
  forbiddenSourcePaths,
  validateAutonomyContractText,
  validateCanonicalRoadmap,
  validatePinnedItems,
  validateSourceGuard,
} from "./strategy-realignment-validator-core.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const activeCommit = "a751cb17dcb768097798b4278882a64103527811";
const staleCommit = "4911ae44";
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const firstPassArg = option("--first-pass") ?? args.find((arg) => !arg.startsWith("--"));
const correctedPath = resolve(option("--roadmap") ?? join(repoRoot, "roadmap.json"));
const allowImplementation = args.includes("--allow-implementation");
if (!firstPassArg) {
  console.error("usage: node docs/strategy-realignment-validation-2026-07-30.mjs --first-pass <first-pass-roadmap.json> [--roadmap <candidate.json>] [--allow-implementation]");
  process.exit(2);
}
const firstPassPath = resolve(firstPassArg);
const { RoadmapSchema } = await tsImport(
  pathToFileURL(join(repoRoot, "vanta-ts/src/roadmap/schema.ts")).href,
  import.meta.url,
);

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
}

function parseRoadmap(raw, label) {
  const roadmap = JSON.parse(raw);
  assert(roadmap && Array.isArray(roadmap.items), `${label}: items must be an array`);
  return roadmap;
}

function readRoadmap(path, label) {
  return parseRoadmap(readFileSync(path, "utf8"), label);
}

function roadmapAt(commit) {
  return parseRoadmap(git(["show", `${commit}:roadmap.json`]), commit);
}

function byId(roadmap) {
  return new Map(roadmap.items.map((item) => [item.id, item]));
}

function stable(value) {
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fileText(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

const active = roadmapAt(activeCommit);
const stale = roadmapAt(staleCommit);
const firstPassRaw = readFileSync(firstPassPath);
const firstPass = parseRoadmap(firstPassRaw, "first pass");
const correctedRaw = readFileSync(correctedPath);
const corrected = parseRoadmap(correctedRaw, "corrected");
validateCanonicalRoadmap(corrected, RoadmapSchema);
validatePinnedItems(corrected);
const pinnedHashes = {
  active: "1f1334605d51c9fe5794bc53396655e987082013a73eef5e71f82b55ad50288c",
  stale: "07969a59171ab52da78057702a498878b73c42fb709549a5ec7a28c3c24a72ae",
  firstPass: "b15d6dcef3fe200a31f0a8ffc07fc9aad9df740118023da1ff5a27ae4658ff43",
  corrected: "c98ca5b4662216b42111d98ceadfef01b6fe0b5e547794b134f11f4512e0dd1f",
};
assert(sha256(Buffer.from(git(["show", `${activeCommit}:roadmap.json`]))) === pinnedHashes.active, "active roadmap snapshot hash differs");
assert(sha256(Buffer.from(git(["show", `${staleCommit}:roadmap.json`]))) === pinnedHashes.stale, "stale roadmap snapshot hash differs");
assert(sha256(firstPassRaw) === pinnedHashes.firstPass, "first-pass roadmap snapshot hash differs");
if (correctedPath === join(repoRoot, "roadmap.json")) {
  assert(sha256(correctedRaw) === pinnedHashes.corrected, "corrected roadmap snapshot hash differs");
}

const activeById = byId(active);
const staleById = byId(stale);
const correctedById = byId(corrected);
const correctedIds = corrected.items.map((item) => item.id);

assert(
  correctedIds.length === new Set(correctedIds).size,
  "corrected roadmap IDs must be unique",
);
assert(corrected.items.length === 1331, "corrected roadmap must contain 1,331 records");

for (const id of activeById.keys()) {
  assert(correctedById.has(id), `active ID missing from corrected roadmap: ${id}`);
}

const expectedNewIds = [
  "TRUST-02",
  "UX-03",
  "TRUST-04",
  "TRUST-01",
  "OP-01",
  "GROW-01",
  "TRUST-03",
  "TRUST-05",
  "TRUST-06",
  "OP-03",
  "UX-04",
  "LIFE-02",
].sort();
const actualNewIds = [...correctedById.keys()]
  .filter((id) => !activeById.has(id))
  .sort();
assert(
  stable(actualNewIds) === stable(expectedNewIds),
  `new roadmap ID set differs: ${actualNewIds.join(", ")}`,
);

const expectedChangedIds = [
  "VANTA-STREAMING-TTS-GATEWAY-AUDIO",
  "VANTA-MSA-NATIVE-RUNTIME-PORT",
  "BROWSER-WORKFLOW-ACTION-BOUNDARY",
  "QUICKSILVER-STARTUP-CRITICAL-PATH",
  "QUICKSILVER-DESKTOP-STREAM-PERF",
  "GATEWAY-DELIVERY-OBLIGATION-LEDGER",
  "EF-SUPPORT-DESKTOP-CONTROLS",
  "EF-SUPPORT-STATE-EXPIRY",
  "EF-SUPPORT-NONOVERREACH-EVALS",
  "REWARD-SEEKING-THREAT-MODEL",
  "REWARD-PROCESS-INTEGRITY-BOUNDARY",
  "REWARD-SEEKING-CONTRASTIVE-DETECTOR",
  "REWARD-SEEKING-BEHAVIORAL-SIGNAL-SUITE",
  "REWARD-SEEKING-CALIBRATION-CONTROLS",
  "REWARD-SEEKING-EVAL-AWARENESS-REDTEAM",
  "REWARD-SEEKING-OVERSIGHT-GENERALIZATION",
  "REWARD-SEEKING-MODEL-LEDGER",
  "REWARD-SEEKING-RELEASE-GATE",
  "CONNECT-INTEGRATION-STATE-CATALOG",
  "CONNECT-TRELLO-ADAPTER",
  "CONNECT-DROPBOX-ADAPTER",
  "CONNECT-BOX-DRIVE-ROVO-PACKS",
].sort();
const actualChangedIds = [];

for (const [id, before] of activeById) {
  const after = correctedById.get(id);
  if (stable(before) === stable(after)) continue;
  actualChangedIds.push(id);
  const changedKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => stable(before[key]) !== stable(after[key]))
    .sort();
  assert(
    stable(changedKeys) === stable(["notes", "parkedReason", "status", "updated"]),
    `${id}: unexpected changed keys ${changedKeys.join(", ")}`,
  );
  assert(after.status === "parked", `${id}: intentional transition must end parked`);
}

assert(
  stable(actualChangedIds.sort()) === stable(expectedChangedIds),
  "existing-record change set differs from the reported 22-card mapping",
);

const expectedActiveOnly = [
  "CONNECT-BOX-DRIVE-ROVO-PACKS",
  "CONNECT-DROPBOX-ADAPTER",
  "CONNECT-INTEGRATION-STATE-CATALOG",
  "CONNECT-TRELLO-ADAPTER",
  "TUI-DETERMINISTIC-TURN-SUMMARY",
  "TUI-OUTPUT-HIERARCHY",
  "TUI-RESTART-CONTINUITY",
  "TUI-TASK-SCOPED-GO-AHEAD",
  "VANTA-MSA-NATIVE-RUNTIME-PORT",
  "VANTA-MSA-NVIDIA-RUNTIME-PROOF",
  "VANTA-MSA-TS-INTEGRATION",
  "VANTA-REUSABLE-RUN-LIBRARY",
  "VANTA-STREAMING-TTS-FIRST-CLAUSE",
  "VANTA-STREAMING-TTS-GATEWAY-AUDIO",
].sort();
const activeOnly = [...activeById.keys()]
  .filter((id) => !staleById.has(id))
  .sort();
assert(stable(activeOnly) === stable(expectedActiveOnly), "active-only ID set differs");
assert(
  [...staleById.keys()].every((id) => activeById.has(id)),
  "stale snapshot contains an ID absent from the active baseline",
);

const statuses = new Set(["shipped", "building", "blocked", "next", "horizon", "parked"]);
const tiers = new Set(["rock", "pebble", "sand"]);
for (const item of corrected.items) {
  assert(item.id && item.track && item.title && item.size, `${item.id}: required field missing`);
  assert(statuses.has(item.status), `${item.id}: invalid status ${item.status}`);
  assert(item.tier === undefined || tiers.has(item.tier), `${item.id}: invalid tier`);
  assert(
    item.status === "parked" ? Boolean(item.parkedReason) : !item.parkedReason,
    `${item.id}: parkedReason invariant failed`,
  );
  for (const dependency of item.after ?? []) {
    assert(correctedById.has(dependency), `${item.id}: unresolved dependency ${dependency}`);
  }
}

const countStatus = (status) => corrected.items.filter((item) => item.status === status).length;
const open = corrected.items.filter(
  (item) => item.status !== "shipped" && item.status !== "parked",
);
assert(countStatus("building") <= 2, "Building exceeds policy cap 2");
assert(countStatus("next") <= 4, "Next exceeds policy cap 4");
assert(open.length <= 12, "open inventory exceeds policy cap 12");
assert(countStatus("building") + countStatus("next") <= 6, "implementation-ready inventory exceeds policy cap 6");
// The named July 30 correction snapshot intentionally fills the 2/4/6/12 caps.
assert(countStatus("building") === 2, "Building count must be 2");
assert(countStatus("next") === 4, "Next count must be 4");
assert(countStatus("horizon") === 6, "Horizon count must be 6");
assert(open.length === 12, "open inventory must be 12");
assert(
  countStatus("building") + countStatus("next") === 6,
  "implementation-ready inventory must be 6",
);

const outcomes = [
  "TRUST-01", "TRUST-02", "TRUST-03", "TRUST-04", "TRUST-05", "TRUST-06",
  "OP-01", "OP-02", "OP-03", "OP-04", "OP-05",
  "UX-01", "UX-02", "UX-03", "UX-04",
  "LIFE-01", "LIFE-02", "LIFE-03", "LIFE-04",
  "GROW-01", "GROW-02", "GROW-03", "GROW-04", "GROW-05",
  "PACK-01", "LAB-01", "EVAL-01", "DOGFOOD-01",
].sort();
const outcomePattern = /(?:TRUST|OP|UX|LIFE|GROW|PACK|LAB|EVAL|DOGFOOD)-\d{2}/g;
for (const path of [
  "STRATEGY.md",
  "docs/prd.md",
  "ROADMAP.md",
  "docs/strategy-realignment-correction-2026-07-30.md",
]) {
  const blocks = [...fileText(path).matchAll(/```text\n([\s\S]*?)\n```/g)]
    .map((match) => [...new Set(match[1].match(outcomePattern) ?? [])].sort());
  assert(
    blocks.some((block) => stable(block) === stable(outcomes)),
    `${path}: exact 28-outcome block missing`,
  );
}

const autonomyLabels = [
  "R0 — Observe",
  "R1 — Recommend",
  "R2 — Prepare",
  "R3 — Confirm",
  "R4 — Delegate",
  "R5 — Autonomous delegate",
];
const lifecycle = [
  "draft",
  "queued",
  "running",
  "waiting",
  "needs human",
  "stopped",
  "failed",
  "unverified",
  "verified",
];
const governingFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  "STRATEGY.md",
  "SOUL.md",
  "DECISIONS.md",
  "README.md",
  "docs/prd.md",
  "docs/product-acceptance.md",
  "docs/strategy-realignment-correction-2026-07-30.md",
  "vanta-website/docs/autonomy.md",
];
const exactAutonomyFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  "STRATEGY.md",
  "SOUL.md",
  "docs/prd.md",
  "docs/product-acceptance.md",
  "docs/strategy-realignment-correction-2026-07-30.md",
  "vanta-website/docs/autonomy.md",
];
for (const path of exactAutonomyFiles) {
  validateAutonomyContractText(fileText(path), path);
}
for (const path of governingFiles) {
  const text = fileText(path);
  for (const label of autonomyLabels) {
    assert(text.includes(label), `${path}: missing ${label}`);
  }
  let cursor = -1;
  for (const state of lifecycle) {
    const match = text.slice(cursor + 1).match(
      new RegExp(`\\b${state.replace(" ", "\\s+")}\\b`),
    );
    assert(match, `${path}: lifecycle state missing or out of order: ${state}`);
    cursor += 1 + match.index;
  }
  for (const disposition of ["denied", "expired", "unknown", "compensated"]) {
    assert(
      new RegExp(`\\b${disposition}\\b`).test(text),
      `${path}: missing disposition ${disposition}`,
    );
  }
}

const baseDecisions = git(["show", `${activeCommit}:DECISIONS.md`]);
const currentDecisions = fileText("DECISIONS.md");
assert(
  currentDecisions.startsWith(baseDecisions),
  "DECISIONS.md prior content is not byte-for-byte preserved",
);
const appendedDecision = currentDecisions.slice(baseDecisions.length);
assert(
  (appendedDecision.match(/^## 2026-07-30/gm) ?? []).length === 1,
  "DECISIONS.md must contain exactly one appended 2026-07-30 entry",
);

const packetLabels = [
  "TUI-DETERMINISTIC-SESSION-ID-050",
  "TUI-OUTPUT-INTEGRITY-049",
  "TUI-RESTART-INTEGRITY-052",
  "TUI-TASK-SCOPED-LIVE-EVIDENCE-051",
  "MS-A-REAL-WORK-OUTCOME-TS-025",
  "CLI-REUSABLE-RUNS-053",
  "COMMS-LIVE-STREAMING-TTS-CLAUSE-2026-07-28",
  "DESKTOP-DEFAULT-MODEL-PREFERENCE-2026-07-28",
  "DESKTOP-DEFAULT-IDENTITY-2026-07-28",
  "DESKTOP-WORKBENCH-LAUNCH-2026-07-28",
  "STARTUP-BOUNDED-APP-PREWARM-2026-07-29",
  "STARTUP-CRITICAL-PATH-2026-07-29",
  "DESKTOP-DEMO-RESET-BAR-2026-07-28",
  "DESKTOP-TASK-AWARENESS-2026-07-28",
];
const sharedPacketLabels = [
  "AM-BETA-033",
  "AM-BETA-034",
  "REWARD-METRICS-SAFETY-046",
  "RELEASE-SMOKE-THRESHOLD-2026-07-27",
  "MCP-FOUNDATION-024",
  "TICKETS-ROADMAP-CANONICAL-036",
  "TICKETS-ROADMAP-CANONICAL-040",
  "CONTRACT-TEST-SCRIPTS-2026-07-28",
];
assert(
  [...packetLabels, ...sharedPacketLabels].every(
    (id) => !activeById.has(id) && !staleById.has(id) && !byId(firstPass).has(id),
  ),
  "a packet alias unexpectedly became a roadmap ID",
);
const correctionReport = fileText("docs/strategy-realignment-correction-2026-07-30.md");
for (const label of [...packetLabels, ...sharedPacketLabels]) {
  assert(correctionReport.includes(label), `packet discrepancy mapping missing: ${label}`);
}

const changedPaths = [
  ...git(["diff", "--name-only", activeCommit, "--"]).trim().split("\n"),
  ...git(["ls-files", "--others", "--exclude-standard"]).trim().split("\n"),
].filter(Boolean);
const forbiddenPaths = forbiddenSourcePaths(changedPaths);
if (!allowImplementation) validateSourceGuard(changedPaths);

console.log(JSON.stringify({
  ok: true,
  active: active.items.length,
  firstPass: firstPass.items.length,
  corrected: corrected.items.length,
  preservedActiveIds: activeById.size,
  added: actualNewIds.length,
  changedExisting: actualChangedIds.length,
  unchangedExisting: activeById.size - actualChangedIds.length,
  uniqueIds: new Set(correctedIds).size,
  dependenciesResolved: true,
  canonicalSchemaValid: true,
  dependenciesAcyclic: true,
  status: {
    shipped: countStatus("shipped"),
    parked: countStatus("parked"),
    building: countStatus("building"),
    next: countStatus("next"),
    horizon: countStatus("horizon"),
  },
  open: open.length,
  implementationReady: countStatus("building") + countStatus("next"),
  outcomesSetEqual: outcomes.length,
  governingContractFiles: governingFiles.length,
  exactAutonomyDefinitionFiles: exactAutonomyFiles.length,
  decisionsPriorBytesPreserved: true,
  correctionOnlySourceGuard: forbiddenPaths.length === 0 ? "pass" : (allowImplementation ? "reported-post-correction-implementation" : "fail"),
  forbiddenPathsChanged: forbiddenPaths.length,
  forbiddenPaths,
  packetLabelDiscrepancy: packetLabels.length + sharedPacketLabels.length,
  sha256: {
    active: pinnedHashes.active,
    stale: pinnedHashes.stale,
    firstPass: sha256(firstPassRaw),
    corrected: sha256(correctedRaw),
  },
}, null, 2));
