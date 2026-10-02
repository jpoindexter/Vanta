// Agent-readable build order — a GENERATED VIEW of roadmap.json.
//
//   node scripts/build-order.mjs [outPath]
//
// The default output is docs/vanta-build-order-agent-readable.md in this repo.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const DEFAULT_OUT = join(repoRoot, "docs", "vanta-build-order-agent-readable.md");
const TRACKS = ["Harness", "Operator", "Desktop App", "Solutioning", "Extensibility", "Cofounder engine"];
const STATUS_ORDER = { building: 0, next: 1, horizon: 2 };
const TIER_ORDER = { rock: 0, pebble: 1, sand: 2 };
const TRACK_ORDER = Object.fromEntries(TRACKS.map((track, index) => [track, index]));
const SIZE_ORDER = { XS: 0, S: 1, M: 2, L: 3, XL: 4 };
const EFFORT_ORDER = { low: 0, medium: 1, high: 2 };

const order = (map, value, fallback) => (value in map ? map[value] : fallback);

export function validateRoadmapGraph(roadmap) {
  if (!roadmap || !Array.isArray(roadmap.items) || roadmap.items.length === 0) {
    throw new Error("roadmap must contain at least one item");
  }
  const ids = new Set();
  const normalizedIds = new Set();
  for (const item of roadmap.items) {
    const normalizedId = String(item.id).toLowerCase();
    if (normalizedIds.has(normalizedId)) throw new Error(`duplicate roadmap ID: ${item.id}`);
    ids.add(item.id);
    normalizedIds.add(normalizedId);
  }
  for (const item of roadmap.items) {
    validateDependencies(item, ids);
  }

  const visiting = new Set();
  const visited = new Set();
  const byId = new Map(roadmap.items.map((item) => [item.id, item]));
  const visit = (id, trail = []) => {
    if (visiting.has(id)) throw new Error(`roadmap dependency cycle: ${[...trail, id].join(" -> ")}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.after ?? []) visit(dependency, [...trail, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);
}

function validateDependencies(item, ids) {
  for (const dependency of item.after ?? []) {
    if (dependency === item.id) throw new Error(`${item.id}: self-dependency`);
    if (!ids.has(dependency)) throw new Error(`${item.id}: missing dependency ${dependency}`);
  }
}

export function openItems(roadmap) {
  validateRoadmapGraph(roadmap);
  const prioritized = roadmap.items
    .filter((item) => item.status !== "shipped" && item.status !== "parked")
    .map((item, index) => ({ ...item, __index: index }));
  prioritized.sort(
    (a, b) =>
      order(STATUS_ORDER, a.status, 9) - order(STATUS_ORDER, b.status, 9) ||
      order(TIER_ORDER, a.tier, 3) - order(TIER_ORDER, b.tier, 3) ||
      order(TRACK_ORDER, a.track, 9) - order(TRACK_ORDER, b.track, 9) ||
      order(SIZE_ORDER, a.size, 5) - order(SIZE_ORDER, b.size, 5) ||
      order(EFFORT_ORDER, a.effort, 3) - order(EFFORT_ORDER, b.effort, 3) ||
      a.__index - b.__index,
  );

  // Stable Kahn sort: dependency readiness wins, while the existing roadmap
  // priority remains the tie-breaker. Unlike the former ten-pass shuffler,
  // this remains correct for dependency chains of any length.
  const openIds = new Set(prioritized.map((item) => item.id));
  const remaining = new Map(prioritized.map((item) => [item.id, item]));
  const open = [];
  while (remaining.size > 0) {
    const ready = prioritized.find((item) =>
      remaining.has(item.id) &&
      (item.after ?? []).every((dependency) => !openIds.has(dependency) || !remaining.has(dependency)),
    );
    if (!ready) throw new Error("roadmap dependency cycle among open items");
    remaining.delete(ready.id);
    open.push(ready);
  }
  for (const item of open) delete item.__index;
  return open;
}

export function buildOrderDocument(roadmap) {
  const open = openItems(roadmap);
  const counts = {};
  for (const item of open) counts[item.track] = (counts[item.track] ?? 0) + 1;

  const lines = [
    "# Vanta Build Order — Agent-Readable",
    "",
    "Source: roadmap.json (generated view — do not edit; regenerate via `node scripts/build-order.mjs`)",
    `Roadmap updated: ${roadmap.updated}`,
    "Strategy: STRATEGY.md (one product with Vanta, Engine, and Lab boundaries; roadmap tracks are compatible responsibilities)",
    "",
    "## Agent instructions",
    "Build the smallest dependency-ready slice from the two active lanes. Read repo/folder AGENTS.md + CLAUDE.md + STRATEGY.md, preserve protected paths and unrelated dirty work, add or update tests first, and change status only after the card's real Done criterion is executed. Do not commit or push unless the current user instruction explicitly authorizes it. High-risk effects, credentials, kernel/factory edits, merges, publication, and deployment require their own authority.",
    "",
    "Ordering: open only; building > next > horizon; rock > pebble > sand; compatible responsibility (Harness > Operator > Desktop App > Solutioning > Extensibility > Cofounder engine); S > M > L; low > medium > high; `after:` dependencies remain ahead of dependents.",
    "",
    "The 28 convergence outcomes are an acceptance catalog, not 28 simultaneous projects. `roadmap.json` is the only product-development work database.",
    "",
    "## Summary",
    `- total_cards: ${roadmap.items.length}`,
    `- open_cards: ${open.length}`,
    ...TRACKS.filter((track) => counts[track]).map((track) => `- ${track}: ${counts[track]} open`),
    "",
    "## Build order",
    "",
  ];

  open.forEach((item, index) => {
    const number = String(index + 1).padStart(3, "0");
    lines.push(`${number}. [${item.status}] ${item.id} — ${item.title}`);
    const metadata = [
      `track: ${item.track}`,
      `tier: ${item.tier ?? "-"}`,
      `size: ${item.size}`,
      `effort: ${item.effort ?? "-"}`,
      `model: ${item.model ?? "-"}`,
    ];
    if (item.after?.length) metadata.push(`after: ${item.after.join(", ")}`);
    lines.push(`    ${metadata.join(" | ")}`);
    lines.push(`    why: ${item.summary}`);
    lines.push(`    done: ${item.done}`);
    lines.push("");
  });
  return lines.join("\n");
}

function runCli() {
  const outputPath = resolve(process.argv[2] ?? DEFAULT_OUT);
  const roadmap = JSON.parse(readFileSync(join(repoRoot, "roadmap.json"), "utf8"));
  const document = buildOrderDocument(roadmap);
  writeFileSync(outputPath, document);
  console.log(`build order → ${outputPath} (${openItems(roadmap).length} open cards)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runCli();
