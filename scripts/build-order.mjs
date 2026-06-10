// Agent-readable build order — a GENERATED VIEW of roadmap.json (STRATEGY.md:
// "One source of truth"). Never edit the output; regenerate it.
//
//   node scripts/build-order.mjs [outPath]   (default: ~/Desktop/vanta-build-order-agent-readable.md)
//
// Ordering (STRATEGY.md "Build order rule"):
//   status (building > next > horizon) → tier (rock > pebble > sand) →
//   pillar (Harness > Operator > Solutioning > Extensibility > Cofounder engine) →
//   size (S→XL) → effort (low→high) → stable. A card with `after: [ids]` is
//   bumped below its open dependencies.
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const OUT = process.argv[2] ?? join(homedir(), "Desktop", "vanta-build-order-agent-readable.md");
const r = JSON.parse(readFileSync("roadmap.json", "utf8"));

const PILLARS = ["Harness", "Operator", "Solutioning", "Extensibility", "Cofounder engine"];
const ord = (m, v, fb) => (v in m ? m[v] : fb);
const S_STATUS = { building: 0, next: 1, horizon: 2 };
const S_TIER = { rock: 0, pebble: 1, sand: 2 };
const S_PILLAR = Object.fromEntries(PILLARS.map((p, i) => [p, i]));
const S_SIZE = { XS: 0, S: 1, M: 2, L: 3, XL: 4 };
const S_EFFORT = { low: 0, medium: 1, high: 2 };

const open = r.items.filter((i) => i.status !== "shipped");
open.forEach((it, i) => (it.__i = i));
open.sort(
  (a, b) =>
    ord(S_STATUS, a.status, 9) - ord(S_STATUS, b.status, 9) ||
    ord(S_TIER, a.tier, 3) - ord(S_TIER, b.tier, 3) ||
    ord(S_PILLAR, a.track, 9) - ord(S_PILLAR, b.track, 9) ||
    ord(S_SIZE, a.size, 5) - ord(S_SIZE, b.size, 5) ||
    ord(S_EFFORT, a.effort, 3) - ord(S_EFFORT, b.effort, 3) ||
    a.__i - b.__i,
);
open.forEach((it) => delete it.__i);

// `after` bump: never list a card before an open dependency. Bounded passes —
// a cycle can't loop forever, it just stops moving.
for (let pass = 0; pass < 10; pass++) {
  let moved = false;
  for (const it of open) {
    if (!it.after?.length) continue;
    const depIdx = Math.max(...it.after.map((d) => open.findIndex((o) => o.id === d)));
    const selfIdx = open.indexOf(it);
    if (depIdx > selfIdx) {
      open.splice(selfIdx, 1);
      open.splice(depIdx, 0, it); // depIdx shifted left by the removal → lands just after dep
      moved = true;
    }
  }
  if (!moved) break;
}

const counts = {};
for (const i of open) counts[i.track] = (counts[i.track] ?? 0) + 1;

const lines = [
  "# Vanta Build Order — Agent-Readable",
  "",
  "Source: roadmap.json (generated view — do not edit; regenerate via `node scripts/build-order.mjs`)",
  `Roadmap updated: ${r.updated}`,
  "Strategy: STRATEGY.md (5 pillars; CC parity is a quarry, not a goal)",
  "",
  "## Agent instructions",
  "Build in numbered order. For each item: read repo/folder AGENTS.md + CLAUDE.md + STRATEGY.md, implement the smallest complete slice, add/update tests, verify with targeted tests/typecheck/build or real UI observation, update roadmap status when shipped, commit the slice, then continue. Stop before high-risk actions, secrets, kernel edits, or scope changes.",
  "",
  "Ordering: open only; building > next > horizon; rock > pebble > sand; pillar (Harness > Operator > Solutioning > Extensibility > Cofounder engine); S > M > L; low > medium > high; `after:` deps bump below their dependency.",
  "",
  "## Summary",
  `- total_cards: ${r.items.length}`,
  `- open_cards: ${open.length}`,
  ...PILLARS.filter((p) => counts[p]).map((p) => `- ${p}: ${counts[p]} open`),
  "",
  "## Build order",
  "",
];

open.forEach((it, n) => {
  const num = String(n + 1).padStart(3, "0");
  lines.push(`${num}. [${it.status}] ${it.id} — ${it.title}`);
  const meta = [
    `track: ${it.track}`,
    `tier: ${it.tier ?? "-"}`,
    `size: ${it.size}`,
    `effort: ${it.effort ?? "-"}`,
    `model: ${it.model ?? "-"}`,
  ];
  if (it.after?.length) meta.push(`after: ${it.after.join(", ")}`);
  lines.push(`    ${meta.join(" | ")}`);
  lines.push(`    why: ${it.summary}`);
  lines.push(`    done: ${it.done}`);
  lines.push("");
});

writeFileSync(OUT, lines.join("\n"));
console.log(`build order → ${OUT} (${open.length} open cards)`);
