// Generate the public roadmap page (docs/roadmap.md) as a real, browsable LIST of
// every item, grouped by status, straight from roadmap.json. Sanitized for the
// public site (no Claude-Code / Codex / Hermes / "parity" framing — going-public rule).
//   node vanta-website/scripts/gen-roadmap-list.mjs        (run from repo root)
import { readFileSync, writeFileSync } from "node:fs";

const r = JSON.parse(readFileSync("roadmap.json", "utf8"));
const items = r.items;

// Underscore variant (CLAUDE_CODE_*) + euphemisms + provenance all count as forbidden.
const FORBIDDEN = /claude[\s_-]?code|\bcodex\b|hermes|openclaw|another agent|anthropic|\bCC-[A-Z]/i;

// Best-effort scrub of internal/provenance framing for the public list.
function clean(s) {
  if (!s) return "";
  return s
    .replace(/,?\s*\(?\s*like\s+claude\/codex\s*\)?/gi, "")
    .replace(/\(\s*vanta-cli\s+parity\s*\)/gi, "")
    .replace(/\s*\(v\d+(?:\.\d+)+\)/gi, "")
    .replace(/<claude-code-hint>/gi, "plugin-hint")
    .replace(/claude[\s_-]?code[\s_-]?hint/gi, "plugin-hint")
    .replace(/claude[\s_-]?code/gi, "the CLI")
    .replace(/\bcodex\b/gi, "")
    .replace(/\bhermes\b/gi, "")
    .replace(/\bopenclaw\b/gi, "")
    .replace(/\banother agent('s)?\b/gi, "")
    .replace(/\banthropic('s)?\b/gi, "")
    .replace(/\s*\bparity\b/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s*—\s*/g, " — ")   // normalize em-dash spacing
    .replace(/\s{2,}/g, " ")
    .replace(/[—,\s]+$/g, "")      // trim trailing dangling punctuation
    .trim();
}

// MDX reads <x> as a JSX tag and { } as an expression — escape them in plain titles.
const MDX = { "<": "&lt;", ">": "&gt;", "{": "&#123;", "}": "&#125;" };
const escMdx = (s) => s.replace(/[<>{}]/g, (c) => MDX[c]);

// Titles only — summaries carry too much internal/provenance framing for the public site.
let dropped = 0;
function entry(i) {
  const title = clean(i.title);
  if (!title || FORBIDDEN.test(title)) {
    dropped++;
    return null; // safety net: never emit anything still carrying a forbidden term
  }
  return `- ${escMdx(title)}`;
}

const PILLARS = ["Harness", "Operator", "Extensibility", "Solutioning", "Cofounder engine"];
const byStatus = (s) => items.filter((i) => i.status === s);

const L = [];
L.push("---", "id: roadmap", "title: Roadmap", "sidebar_position: 1", "---", "");
L.push("# Roadmap", "");
L.push(
  "The full, live backlog — every slice in `roadmap.json`, generated straight from source. A slice is **shipped** only when its done-criterion holds (tests green, behavior verified).",
  "",
);

// A glanceable journey + counts.
L.push("```mermaid");
L.push("flowchart LR");
L.push('  F["<b>Foundations</b><br/>kernel · loop"]');
L.push('  SHIP["<b>Shipped</b><br/>operator · selfhood"]');
L.push('  NOW["<b>Now</b><br/>open beta"]:::active');
L.push('  NEXT["<b>Next</b><br/>presence · reach"]');
L.push('  LATER["<b>Later</b><br/>company · ecosystem"]');
L.push("  F --> SHIP --> NOW --> NEXT --> LATER");
L.push("  classDef active fill:#6bdcff,stroke:#0b86a3,color:#06222b;");
L.push("```", "");

const cNext = byStatus("next").length;
const cHorizon = byStatus("horizon").length;
const cShipped = byStatus("shipped").length;
L.push(
  `**${cShipped} shipped · ${cNext} in build (the open beta) · ${cHorizon} coming up.**`,
  "",
);

// NOW — the beta path, in build order (next), keep roadmap.json order.
L.push("## Now — in build (the open beta)", "");
L.push("These are the rocks in build order on the way to a launchable open beta.", "");
for (const i of byStatus("next")) { const e = entry(i); if (e) L.push(e); }
L.push("");

// COMING UP — horizon, grouped by pillar so 136 items stay browsable.
L.push("## Coming up", "");
for (const p of PILLARS) {
  const group = byStatus("horizon").filter((i) => i.track === p);
  if (!group.length) continue;
  L.push(`### ${p}`, "");
  for (const i of group) { const e = entry(i); if (e) L.push(e); }
  L.push("");
}

// SHIPPED — everything done, grouped by pillar, collapsible to keep the page navigable.
L.push("## Shipped", "");
for (const p of PILLARS) {
  const group = byStatus("shipped").filter((i) => i.track === p);
  if (!group.length) continue;
  L.push(`<details>`, `<summary><b>${p}</b> — ${group.length} shipped</summary>`, "");
  for (const i of group) { const e = entry(i); if (e) L.push(e); }
  L.push("", `</details>`, "");
}

L.push("---", "");
L.push(`> Generated from \`roadmap.json\` (${r.updated}). Curated highlights live in the [changelog](./changelog.md).`, "");

writeFileSync("vanta-website/docs/roadmap.md", L.join("\n"));
console.log(`roadmap.md → ${items.length} items listed (${dropped} withheld by the public scrub)`);
