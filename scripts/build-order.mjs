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
const TRACKS = ["Harness", "Operator", "Solutioning", "Extensibility", "Cofounder engine"];
const STATUS_ORDER = { building: 0, next: 1, horizon: 2 };
const TIER_ORDER = { rock: 0, pebble: 1, sand: 2 };
const TRACK_ORDER = Object.fromEntries(TRACKS.map((track, index) => [track, index]));
const SIZE_ORDER = { XS: 0, S: 1, M: 2, L: 3, XL: 4 };
const EFFORT_ORDER = { low: 0, medium: 1, high: 2 };

const order = (map, value, fallback) => (value in map ? map[value] : fallback);

function openItems(roadmap) {
  const open = roadmap.items
    .filter((item) => item.status !== "shipped" && item.status !== "parked")
    .map((item, index) => ({ ...item, __index: index }));
  open.sort(
    (a, b) =>
      order(STATUS_ORDER, a.status, 9) - order(STATUS_ORDER, b.status, 9) ||
      order(TIER_ORDER, a.tier, 3) - order(TIER_ORDER, b.tier, 3) ||
      order(TRACK_ORDER, a.track, 9) - order(TRACK_ORDER, b.track, 9) ||
      order(SIZE_ORDER, a.size, 5) - order(SIZE_ORDER, b.size, 5) ||
      order(EFFORT_ORDER, a.effort, 3) - order(EFFORT_ORDER, b.effort, 3) ||
      a.__index - b.__index,
  );
  for (const item of open) delete item.__index;

  // Never list a card before one of its open dependencies. Bounded passes keep
  // a malformed dependency cycle from looping forever.
  for (let pass = 0; pass < 10; pass++) {
    let moved = false;
    for (const item of open) {
      if (!item.after?.length) continue;
      const dependencyIndex = Math.max(...item.after.map((id) => open.findIndex((candidate) => candidate.id === id)));
      const itemIndex = open.indexOf(item);
      if (dependencyIndex > itemIndex) {
        open.splice(itemIndex, 1);
        open.splice(dependencyIndex, 0, item);
        moved = true;
      }
    }
    if (!moved) break;
  }
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
    "Ordering: open only; building > next > horizon; rock > pebble > sand; compatible responsibility (Harness > Operator > Solutioning > Extensibility > Cofounder engine); S > M > L; low > medium > high; `after:` dependencies remain ahead of dependents.",
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
