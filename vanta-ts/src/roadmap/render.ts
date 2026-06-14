import type { Roadmap, RoadmapItem } from "./schema.js";
import { WIP_LIMIT } from "./wip.js";

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

// model·effort build-routing badge — only when tagged
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

// Within a status column the cards are grouped by pickle-jar tier (rocks first),
// so the board reads top-priority-down. Untiered items fall into a trailing bucket.
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
  const heading = `${COL_LABEL[status] ?? status}${wipBadge}`;
  return `<div class="col" data-status="${status}"><h2 class="ch s-${status}">${heading}</h2>${groups}${tail}</div>`;
}

const CSS = `*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0c0f14;color:#c8cdd8;padding:1.5rem}
h1{font-size:1.25rem;margin-bottom:.35rem;font-weight:600}
.meta{color:#3e4a5c;font-size:.72rem;margin-bottom:1.25rem;font-family:ui-monospace,monospace}
.filters{display:flex;flex-wrap:wrap;gap:.75rem;margin-bottom:1.25rem;align-items:center}
.filters label{font-size:.65rem;color:#3e4a5c;font-weight:700;font-family:ui-monospace,monospace;letter-spacing:.09em;text-transform:uppercase}
select{background:#10141b;border:1px solid #1e2737;color:#5e6e82;padding:.35rem .6rem;border-radius:0;cursor:pointer;font-size:.72rem;font-family:ui-monospace,monospace;min-width:120px}
select:hover{border-color:#384454;color:#a0aab8}
select:focus{outline:none;border-color:#f59e0b;color:#e8eaf0}
option{background:#0c0f14;color:#c8cdd8;padding:.3rem}
button{background:#10141b;border:1px solid #1e2737;color:#3e4a5c;padding:.25rem .6rem;border-radius:0;cursor:pointer;font-size:.7rem;font-family:ui-monospace,monospace}
button.active,button:hover{background:#f59e0b;border-color:#f59e0b;color:#0c0f14;font-weight:700}
.board{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;align-items:start}
.col h2{font-size:.65rem;font-weight:700;padding:.3rem .65rem;margin-bottom:.75rem;letter-spacing:.1em;text-transform:uppercase;font-family:ui-monospace,monospace;background:transparent;border-left:3px solid}
h2.s-building{color:#4ade80;border-left-color:#4ade80}
h2.s-next{color:#60a5fa;border-left-color:#60a5fa}
h2.s-horizon{color:#c084fc;border-left-color:#c084fc}
h2.s-shipped{color:#475569;border-left-color:#475569}
.tg{margin-bottom:.75rem}
.tg h3{font-size:.62rem;font-weight:700;color:#3e4a5c;letter-spacing:.09em;text-transform:uppercase;margin-bottom:.35rem;padding:.15rem .5rem;border-left:2px solid #1e2737;font-family:ui-monospace,monospace}
.t-rock h3{color:#f59e0b;border-left-color:#f59e0b}
.t-pebble h3{color:#60a5fa;border-left-color:#60a5fa}
.t-sand h3{color:#4ade80;border-left-color:#4ade80}
.badges{display:flex;gap:.35rem;margin-bottom:.35rem}
.me{font-family:ui-monospace,monospace;font-size:.62rem;padding:.1rem .3rem;border-radius:0;border:1px solid #1e2737;color:#5e6e82}
.m-haiku{border-color:#4ade80;color:#4ade80}
.m-sonnet{border-color:#60a5fa;color:#60a5fa}
.m-opus{border-color:#c084fc;color:#c084fc}
.cx{border-color:#f59e0b;color:#f59e0b}
.card{background:#10141b;border:1px solid #1e2737;padding:.65rem;margin-bottom:.4rem;color:#c8cdd8}
.card:hover{border-color:#384454}
.hd{display:flex;align-items:baseline;gap:.4rem;margin-bottom:.3rem}
.sz{background:transparent;border:1px solid #1e2737;font-size:.62rem;padding:.1rem .3rem;color:#3e4a5c;flex-shrink:0;font-family:ui-monospace,monospace}
.ttl{font-size:.82rem;font-weight:600;flex:1;line-height:1.3;color:#dce0e8}
.trk{font-size:.6rem;color:#3e4a5c;flex-shrink:0;max-width:7rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,monospace}
.lens{font-size:.56rem;padding:.05rem .3rem;flex-shrink:0;font-family:ui-monospace,monospace;letter-spacing:.04em;text-transform:uppercase;border:1px solid}
.l-agent-loop{color:#f59e0b;border-color:#4a3408;background:#171002}
.l-tui{color:#60a5fa;border-color:#1e3a5c;background:#0a1320}
.l-memory{color:#c084fc;border-color:#3a2452;background:#140a1f}
.l-reach{color:#4ade80;border-color:#1e4a32;background:#08160e}
.l-selfhood{color:#f472b6;border-color:#5a2440;background:#1a0810}
.l-coding{color:#5e6e82;border-color:#1e2737;background:#0d1117}
.l-infra{color:#7a8898;border-color:#2a323e;background:#10141b}
.l-cosmetic{color:#475569;border-color:#1e2737;background:#0d1117}
.sum{font-size:.73rem;color:#5e6e82;line-height:1.5;margin-bottom:.35rem}
details>summary{font-size:.68rem;color:#3e4a5c;cursor:pointer;list-style:none;padding:.15rem 0;font-family:ui-monospace,monospace}
details>summary::marker,details>summary::-webkit-details-marker{display:none}
details>summary::before{content:"▸ "}
details[open]>summary::before{content:"▾ "}
.done{font-size:.72rem;color:#7a8898;margin-top:.3rem;padding:.35rem .5rem;background:#0c0f14;border-left:2px solid #1e2737;line-height:1.5}
.sh-section{margin-top:1.75rem}
.sh-section>summary{color:#3e4a5c;cursor:pointer;font-size:.78rem;padding:.45rem .7rem;background:#10141b;border:1px solid #1e2737;list-style:none;font-family:ui-monospace,monospace}
.sh-section>summary::before{content:"▸ "}
.sh-section[open]>summary::before{content:"▾ "}
.sh-grid{columns:3;column-gap:1rem;margin-top:.75rem}
.sh-grid .card{break-inside:avoid}
.hidden{display:none!important}
@media(max-width:880px){.board{grid-template-columns:1fr 1fr}.sh-grid{columns:2}}
@media(max-width:560px){.board{grid-template-columns:1fr}.sh-grid{columns:1}}
.col.drag-over{outline:2px dashed #f59e0b;background:#0d1018}
.card[draggable=true]{cursor:grab}
.card.dragging{opacity:.4}
.wip{font-size:.62rem;font-weight:400;color:#5e6e82;background:#0c0f14;padding:.1rem .3rem;margin-left:.4rem;font-family:ui-monospace,monospace;vertical-align:middle}
.wip.at-limit{color:#f87171;background:#1c0a0a}`;

const DRAG_JS = `(function(){
// Drag-to-move persists via POST /roadmap/move, which only exists when the board
// is SERVED (vanta roadmap serve). Opened as a file:// it has no origin, so the fetch
// fails CORS. Detect that, skip the fetch entirely, and show a read-only banner.
var served=location.protocol==='http:'||location.protocol==='https:';
if(!served){
var b=document.createElement('div');
b.textContent='Read-only view. To drag cards between columns, run  vanta roadmap serve  then open  http://localhost:7789/roadmap/board';
b.style.cssText='position:sticky;top:0;z-index:99;background:#1e293b;border:1px solid #334155;border-left:3px solid #fbbf24;color:#cbd5e1;font:.75rem/1.5 ui-monospace,monospace;padding:.5rem .75rem;margin-bottom:.75rem;border-radius:4px';
document.body.insertBefore(b,document.body.firstChild);
return;
}
var dragging=null;
document.querySelectorAll('.card').forEach(function(card){
card.setAttribute('draggable','true');
card.addEventListener('dragstart',function(){dragging=this.dataset.id;this.classList.add('dragging');});
card.addEventListener('dragend',function(){this.classList.remove('dragging');dragging=null;});
});
document.querySelectorAll('.col[data-status]').forEach(function(col){
col.addEventListener('dragover',function(e){e.preventDefault();this.classList.add('drag-over');});
col.addEventListener('dragleave',function(e){if(!this.contains(e.relatedTarget)){this.classList.remove('drag-over');}});
col.addEventListener('drop',function(e){
e.preventDefault();this.classList.remove('drag-over');
var id=dragging;var status=this.dataset.status;
if(!id||!status)return;
fetch('/roadmap/move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id,status:status})})
.then(function(r){return r.json();})
.then(function(j){if(j.ok)location.reload();else alert('Move failed: '+j.error);})
.catch(function(err){alert('Move error: '+err);});
});
});
})();`;

const JS = `(function(){
var cards=document.querySelectorAll('.card');
var tgs=document.querySelectorAll('.tg');
var cols=document.querySelectorAll('.col');
var activeTrack='all';
var activeSize='all';
var activeModel='all';
var activePriority='all';
var activeLens='all';
function applyFilters(){
cards.forEach(function(c){
var tm=activeTrack==='all'||c.dataset.track===activeTrack;
var sm=activeSize==='all'||c.dataset.size===activeSize;
var mm=activeModel==='all'||c.querySelector('.m-'+activeModel);
var pm=activePriority==='all'||c.dataset.tier===activePriority;
var lm=activeLens==='all'||c.dataset.lens===activeLens;
c.classList.toggle('hidden',!(tm&&sm&&mm&&pm&&lm));
});
tgs.forEach(function(t){
var vis=[].some.call(t.querySelectorAll('.card'),function(c){return !c.classList.contains('hidden');});
t.style.display=vis?'':'none';
});
cols.forEach(function(c){
var vis=[].some.call(c.querySelectorAll('.tg'),function(t){return t.style.display!=='none';});
c.style.display=vis?'':'none';
});
}
document.getElementById('lens-filter').addEventListener('change',function(){activeLens=this.value;applyFilters();});
document.getElementById('track-filter').addEventListener('change',function(){activeTrack=this.value;applyFilters();});
document.getElementById('size-filter').addEventListener('change',function(){activeSize=this.value;applyFilters();});
document.getElementById('model-filter').addEventListener('change',function(){activeModel=this.value;applyFilters();});
document.getElementById('priority-filter').addEventListener('change',function(){activePriority=this.value;applyFilters();});
})();`;

const SIZE_ORDER = ["XS", "S", "M", "L", "XL"] as const;
const MODEL_ORDER = ["haiku", "sonnet", "opus"] as const;
const PRIORITY_ORDER = ["rock", "pebble", "sand"] as const;
const PRIORITY_LABEL: Record<string, string> = {
  rock: "Rock (foundational)",
  pebble: "Pebble (substantial)",
  sand: "Sand (quick wins)",
};

// Ordered most-to-least strategic so the dropdown reads as a priority list.
const LENS_ORDER = [
  "agent-loop",
  "tui",
  "memory",
  "reach",
  "selfhood",
  "infra",
  "coding",
  "cosmetic",
] as const;
const LENS_LABEL: Record<string, string> = {
  "agent-loop": "Agent loop (autonomy)",
  tui: "TUI (display)",
  memory: "Memory + context",
  reach: "Reach (comms/senses)",
  selfhood: "Selfhood + EF",
  infra: "Infra + setup",
  coding: "Coding harness",
  cosmetic: "Cosmetic",
};

function buildOptions(values: string[], labels?: Record<string, string>): string {
  return values.map((v) => `<option value="${esc(v)}">${esc(labels?.[v] ?? v)}</option>`).join("");
}

// One labelled <select> filter. `all` is the always-present reset option.
type FilterSpec = {
  id: string;
  label: string;
  allLabel: string;
  values: string[];
  labels?: Record<string, string>;
};
function filterSelect(f: FilterSpec): string {
  return `<label for="${f.id}-filter">${f.label}:</label>
<select id="${f.id}-filter">
<option value="all">${f.allLabel}</option>
${buildOptions(f.values, f.labels)}
</select>`;
}

// The full filter bar — lens first (primary strategic axis), then priority/track/size/model.
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
<script>${DRAG_JS}${JS}</script>
</body>
</html>`;
}
