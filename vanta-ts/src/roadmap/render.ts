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

const COLS = ["building", "blocked", "next", "horizon"] as const;
const COL_LABEL: Record<string, string> = { building: "Now", blocked: "Blocked", next: "Next", horizon: "Later" };
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

function launchItem(item: RoadmapItem | undefined): string {
  if (!item) return "";
  const deps = item.after?.length && item.status !== "shipped" ? `<span class="lp-deps">after ${esc(item.after.join(" + "))}</span>` : "";
  return `<li class="lp-${item.status}"><span class="lp-row"><span class="lp-id">${esc(item.id)}</span><span class="lp-status">${esc(item.status)}</span></span><span class="lp-title">${esc(item.title)}</span>${deps}</li>`;
}

function launchList(items: Array<RoadmapItem | undefined>): string {
  const rows = items.map(launchItem).filter(Boolean).join("");
  return rows || `<li><span class="lp-title">No cards queued.</span></li>`;
}

function byId(data: Roadmap, id: string): RoadmapItem | undefined {
  return data.items.find((i) => i.id === id);
}

function shippedCount(items: Array<RoadmapItem | undefined>): number {
  return items.filter((i) => i?.status === "shipped").length;
}

function activeLaunchItems(items: Array<RoadmapItem | undefined>): RoadmapItem[] {
  return items.filter((i): i is RoadmapItem => i !== undefined && i.status !== "shipped" && i.status !== "parked");
}

function parkedLaunchItems(items: Array<RoadmapItem | undefined>): RoadmapItem[] {
  return items.filter((i): i is RoadmapItem => i !== undefined && i.status === "parked");
}

type LaunchPhase = {
  name: string;
  promise: string;
  metric: string;
  proofLabel: string;
  viewsLabel: string;
  proof: string[];
  views: string[];
  gate: string;
};

const ACTIVATION_PHASE: LaunchPhase = {
  name: "Activation v1",
  promise: "a cold user gets one useful Vanta result in under 2 minutes.",
  metric: "Activation gate",
  proofLabel: "Prove It",
  viewsLabel: "Visible Workflows",
  proof: ["ACTIVATION-COLD-USER-GATE", "GALLERY-SANDBOX-RECOVERY-FIXTURE", "USER-LANGUAGE-WORKFLOW-COPY", "FRESH-CONTEXT-ACTIVATION-REVIEW", "ROADMAP-DEPENDENCY-GUARD"],
  views: ["OPERATOR-HOME-V1", "CRASHLOG-DIAGNOSE", "SPEC-TO-APP-WIZARD", "VANTA-BG-RESPOND-CONTINUE"],
  gate: "ACTIVATION-V1-RELEASE-GATE",
};

const RUN_ANYWHERE_PHASE: LaunchPhase = {
  name: "Run Anywhere v1",
  promise: "one owner can reach Vanta anywhere and execute safely on controlled infrastructure.",
  metric: "Run-anywhere gate",
  proofLabel: "Remote Execution",
  viewsLabel: "Reach Anywhere",
  proof: ["PCLIP-SANDBOX-AGENTS", "RUN-ANYWHERE-READINESS-STATUS", "BACKEND-SERVERLESS-LIVE"],
  views: ["MSG-ADAPTER-TEAMS", "RUN-ANYWHERE-TERMUX"],
  gate: "RUN-ANYWHERE-V1-RELEASE-GATE",
};

function activeLaunchPhase(data: Roadmap): LaunchPhase {
  return byId(data, RUN_ANYWHERE_PHASE.gate) ? RUN_ANYWHERE_PHASE : ACTIVATION_PHASE;
}

function openSummary(phase: LaunchPhase, activeItems: RoadmapItem[], parkedItems: RoadmapItem[]): string {
  if (activeItems.length) return `Open ${esc(phase.name)} card${activeItems.length === 1 ? "" : "s"}: ${esc(activeItems.map((i) => i.id).join(" + "))}.`;
  if (parkedItems.length) return `${esc(phase.name)} active blockers are parked for later: ${esc(parkedItems.map((i) => i.id).join(" + "))}.`;
  return `${phase.name} shipped. No required launchpad blockers remain.`;
}

function launchPad(data: Roadmap): string {
  const phase = activeLaunchPhase(data);
  const now = data.items.filter((i) => i.status === "building");
  const proof = phase.proof.map((id) => byId(data, id));
  const views = phase.views.map((id) => byId(data, id));
  const gate = [byId(data, phase.gate)];
  const gateDeps = byId(data, phase.gate)?.after?.map((id) => byId(data, id)) ?? [];
  const required = [...gateDeps, ...gate];
  const launchItems = [...proof, ...views, ...gate];
  const activeItems = activeLaunchItems(launchItems);
  const parkedItems = parkedLaunchItems(launchItems);
  return `<section class="launch">
<div class="launch-head">
<div><h2>Launch Pad</h2><p>${esc(phase.name)}: ${esc(phase.promise)}</p><p class="launch-open">${openSummary(phase, activeItems, parkedItems)}</p></div>
<div class="launch-metrics"><div class="launch-metric"><span>${shippedCount(required)}/${required.length}</span><small>${esc(phase.metric)}</small></div><div class="launch-metric muted"><span>${now.length}/${WIP_LIMIT}</span><small>Now slots</small></div></div>
</div>
<div class="launch-grid">
<div class="launch-block"><h3>Build Now</h3><ol>${launchList(now)}</ol></div>
<div class="launch-block"><h3>${esc(phase.proofLabel)}</h3><ol>${launchList(proof)}</ol></div>
<div class="launch-block"><h3>${esc(phase.viewsLabel)}</h3><ol>${launchList(views)}</ol></div>
<div class="launch-block"><h3>Release Gate</h3><ol>${launchList(gate)}</ol></div>
</div>
</section>`;
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
${launchPad(data)}
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
