import type { Roadmap, RoadmapItem } from "./schema.js";
import { WIP_LIMIT } from "./wip.js";
import { CSS, DRAG_JS, FILTER_JS, SIZE_ORDER, MODEL_ORDER, PRIORITY_ORDER, PRIORITY_LABEL, LENS_ORDER, LENS_LABEL } from "./render-assets.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const COLS = ["building", "next", "horizon"] as const;
const COL_LABEL: Record<string, string> = { building: "Now", next: "Next", horizon: "Later" };
const TIER_ORDER = ["rock", "pebble", "sand"] as const;
const TIER_LABEL: Record<string, string> = {
  rock: "Rocks · foundational",
  pebble: "Pebbles",
  sand: "Sand · quick wins",
};

function routing(item: RoadmapItem): string {
  const badges: string[] = [];
  if (item.model) {
    const effort = item.effort ? ` · ${esc(item.effort)}` : "";
    badges.push(`<span class="me m-${esc(item.model)}">${esc(item.model)}${effort}</span>`);
  }
  if (item.codex) badges.push(`<span class="me cx">codex: ${esc(item.codex)}</span>`);
  return badges.join("");
}

function card(item: RoadmapItem): string {
  return `<div class="card s-${item.status}" data-track="${esc(item.track)}" data-id="${esc(item.id)}" data-size="${esc(item.size)}" data-tier="${esc(item.tier ?? "")}" data-lens="${esc(item.lens ?? "")}">
<div class="hd"><span class="sz">${esc(item.size)}</span><span class="ttl">${esc(item.title)}</span>${item.lens ? `<span class="lens l-${esc(item.lens)}">${esc(item.lens)}</span>` : ""}<span class="trk">${esc(item.track)}</span></div>
${routing(item) ? `<div class="badges">${routing(item)}</div>` : ""}
<p class="sum">${esc(item.summary)}</p>
<details><summary>Done criteria</summary><p class="done">${esc(item.done)}</p></details>
</div>`;
}

function column(status: string, items: RoadmapItem[], wipLimit?: number): string {
  const colItems = items.filter((i) => i.status === status);
  const groups = TIER_ORDER.filter((t) => colItems.some((i) => i.tier === t))
    .map(
      (t) =>
        `<div class="tg t-${t}"><h3>${TIER_LABEL[t]}</h3>${colItems.filter((i) => i.tier === t).map(card).join("")}</div>`,
    )
    .join("");
  const untiered = colItems.filter((i) => !i.tier);
  const tail = untiered.length
    ? `<div class="tg"><h3>Untriaged</h3>${untiered.map(card).join("")}</div>`
    : "";
  const wipBadge =
    wipLimit !== undefined
      ? ` <span class="wip${colItems.length >= wipLimit ? " at-limit" : ""}">${colItems.length}/${wipLimit}</span>`
      : "";
  return `<div class="col" data-status="${status}"><h2 class="ch s-${status}">${COL_LABEL[status] ?? status}${wipBadge}</h2>${groups}${tail}</div>`;
}

function buildOptions(values: string[], labels?: Record<string, string>): string {
  return values.map((v) => `<option value="${esc(v)}">${esc(labels?.[v] ?? v)}</option>`).join("");
}

type FilterSpec = { id: string; label: string; allLabel: string; values: string[]; labels?: Record<string, string> };

function filterSelect(f: FilterSpec): string {
  return `<label for="${f.id}-filter">${f.label}:</label>
<select id="${f.id}-filter">
<option value="all">${f.allLabel}</option>
${buildOptions(f.values, f.labels)}
</select>`;
}

function filterBar(data: Roadmap): string {
  const tracks = [...new Set(data.items.map((i) => i.track))].sort();
  const sizes = SIZE_ORDER.filter((s) => data.items.some((i) => i.size === s));
  const models = MODEL_ORDER.filter((m) => data.items.some((i) => i.model === m));
  const priorities = PRIORITY_ORDER.filter((p) => data.items.some((i) => i.tier === p));
  const lenses = LENS_ORDER.filter((l) => data.items.some((i) => i.lens === l));
  const specs: FilterSpec[] = [
    { id: "lens", label: "Lens", allLabel: "All lenses", values: lenses, labels: LENS_LABEL },
    { id: "priority", label: "Priority", allLabel: "All priorities", values: priorities, labels: PRIORITY_LABEL },
    { id: "track", label: "Track", allLabel: "All tracks", values: tracks },
    { id: "size", label: "Size", allLabel: "All sizes", values: sizes },
    { id: "model", label: "Model", allLabel: "All models", values: models },
  ];
  return `<div class="filters">\n${specs.map(filterSelect).join("\n")}\n</div>`;
}

export function renderRoadmap(data: Roadmap): string {
  const board = COLS.map((s) => column(s, data.items, s === "building" ? WIP_LIMIT : undefined)).join("");
  const shipped = data.items.filter((i) => i.status === "shipped");
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vanta Roadmap · ${esc(data.updated)}</title>
<style>${CSS}</style>
</head>
<body>
<h1>Vanta Roadmap</h1>
<p class="meta">Updated ${esc(data.updated)} &middot; ${data.items.length} items</p>
${filterBar(data)}
<div class="board">${board}</div>
<details class="sh-section">
<summary>Shipped (${shipped.length})</summary>
<div class="sh-grid">${shipped.map(card).join("")}</div>
</details>
<script>${DRAG_JS}${FILTER_JS}</script>
</body>
</html>`;
}
