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
  if (!item.model) return "";
  const effort = item.effort ? ` · ${esc(item.effort)}` : "";
  return `<span class="me m-${esc(item.model)}">${esc(item.model)}${effort}</span>`;
}

function card(item: RoadmapItem): string {
  return `<div class="card s-${item.status}" data-track="${esc(item.track)}" data-id="${esc(item.id)}" data-size="${esc(item.size)}">
<div class="hd"><span class="sz">${esc(item.size)}</span><span class="ttl">${esc(item.title)}</span><span class="trk">${esc(item.track)}</span></div>
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
body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:1.5rem}
h1{font-size:1.4rem;margin-bottom:.4rem}
.meta{color:#64748b;font-size:.8rem;margin-bottom:1.25rem}
.filters{display:flex;flex-wrap:wrap;gap:.8rem;margin-bottom:1.25rem;align-items:center}
.filters label{font-size:.75rem;color:#94a3b8;font-weight:600}
select{background:#1e293b;border:1px solid #334155;color:#94a3b8;padding:.4rem .65rem;border-radius:4px;cursor:pointer;font-size:.75rem;font-family:system-ui,sans-serif;min-width:120px}
select:hover{border-color:#475569;color:#cbd5e1}
select:focus{outline:none;border-color:#3b82f6;color:#fff}
option{background:#0f172a;color:#e2e8f0;padding:.35rem}
button{background:#1e293b;border:1px solid #334155;color:#94a3b8;padding:.25rem .65rem;border-radius:4px;cursor:pointer;font-size:.75rem}
button.active,button:hover{background:#3b82f6;border-color:#3b82f6;color:#fff}
.board{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;align-items:start}
.col h2{font-size:.85rem;font-weight:700;padding:.35rem .7rem;border-radius:4px;margin-bottom:.65rem;letter-spacing:.05em;text-transform:uppercase}
.s-building{background:#14532d;color:#86efac}
.s-next{background:#1e3a5f;color:#93c5fd}
.s-horizon{background:#3b0764;color:#d8b4fe}
.s-shipped{background:#1e293b;color:#64748b}
.tg{margin-bottom:.75rem}
.tg h3{font-size:.65rem;font-weight:700;color:#475569;letter-spacing:.08em;text-transform:uppercase;margin-bottom:.35rem;padding:.15rem .5rem;border-left:2px solid #334155}
.t-rock h3{color:#fbbf24;border-left-color:#fbbf24}
.t-pebble h3{color:#93c5fd;border-left-color:#3b82f6}
.t-sand h3{color:#86efac;border-left-color:#22c55e}
.badges{display:flex;gap:.35rem;margin-bottom:.35rem}
.me{font-family:ui-monospace,monospace;font-size:.6rem;padding:.1rem .35rem;border-radius:3px;border:1px solid #334155;color:#94a3b8}
.m-haiku{border-color:#22c55e;color:#86efac}
.m-sonnet{border-color:#3b82f6;color:#93c5fd}
.m-opus{border-color:#a855f7;color:#d8b4fe}
.card{background:#1e293b;border:1px solid #334155;border-radius:6px;padding:.7rem;margin-bottom:.45rem}
.card:hover{border-color:#475569}
.hd{display:flex;align-items:baseline;gap:.45rem;margin-bottom:.3rem}
.sz{background:#0f172a;border:1px solid #334155;border-radius:3px;font-size:.6rem;padding:.1rem .3rem;color:#64748b;flex-shrink:0}
.ttl{font-size:.82rem;font-weight:600;flex:1;line-height:1.3}
.trk{font-size:.6rem;color:#334155;flex-shrink:0;max-width:6rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sum{font-size:.74rem;color:#94a3b8;line-height:1.5;margin-bottom:.35rem}
details>summary{font-size:.7rem;color:#475569;cursor:pointer;list-style:none;padding:.15rem 0}
details>summary::marker,details>summary::-webkit-details-marker{display:none}
details>summary::before{content:"▸ "}
details[open]>summary::before{content:"▾ "}
.done{font-size:.74rem;color:#a5b4c3;margin-top:.3rem;padding:.4rem .5rem;background:#0f172a;border-radius:4px;line-height:1.5}
.sh-section{margin-top:1.75rem}
.sh-section>summary{color:#64748b;cursor:pointer;font-size:.85rem;padding:.5rem .75rem;background:#1e293b;border-radius:4px;list-style:none}
.sh-section>summary::before{content:"▸ "}
.sh-section[open]>summary::before{content:"▾ "}
.sh-grid{columns:3;column-gap:1rem;margin-top:.75rem}
.sh-grid .card{break-inside:avoid}
.hidden{display:none!important}
@media(max-width:880px){.board{grid-template-columns:1fr 1fr}.sh-grid{columns:2}}
@media(max-width:560px){.board{grid-template-columns:1fr}.sh-grid{columns:1}}
.col.drag-over{outline:2px dashed #3b82f6;background:#1a2744;border-radius:6px}
.card[draggable=true]{cursor:grab}
.card.dragging{opacity:.4}
.wip{font-size:.6rem;font-weight:400;color:#94a3b8;background:#0f172a;border-radius:3px;padding:.1rem .3rem;margin-left:.4rem;font-family:ui-monospace,monospace;vertical-align:middle}
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
function applyFilters(){
cards.forEach(function(c){
var tm=activeTrack==='all'||c.dataset.track===activeTrack;
var sm=activeSize==='all'||c.dataset.size===activeSize;
var mm=activeModel==='all'||c.querySelector('.m-'+activeModel);
c.classList.toggle('hidden',!(tm&&sm&&mm));
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
document.getElementById('track-filter').addEventListener('change',function(){activeTrack=this.value;applyFilters();});
document.getElementById('size-filter').addEventListener('change',function(){activeSize=this.value;applyFilters();});
document.getElementById('model-filter').addEventListener('change',function(){activeModel=this.value;applyFilters();});
})();`;

const SIZE_ORDER = ["XS", "S", "M", "L", "XL"] as const;
const MODEL_ORDER = ["haiku", "sonnet", "opus"] as const;

export function renderRoadmap(data: Roadmap): string {
  const tracks = [...new Set(data.items.map((i) => i.track))].sort();
  const sizes = SIZE_ORDER.filter((s) => data.items.some((i) => i.size === s));
  const models = MODEL_ORDER.filter((m) => data.items.some((i) => i.model === m));
  const board = COLS.map((s) => column(s, data.items, s === "building" ? WIP_LIMIT : undefined)).join("");
  const shipped = data.items.filter((i) => i.status === "shipped");

  const trackOptions = tracks
    .map((t) => `<option value="${esc(t)}">${esc(t)}</option>`)
    .join("");
  const sizeOptions = sizes
    .map((s) => `<option value="${esc(s)}">${esc(s)}</option>`)
    .join("");
  const modelOptions = models
    .map((m) => `<option value="${esc(m)}">${esc(m)}</option>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vanta Roadmap · ${esc(data.updated)}</title>
<style>${CSS}</style>
</head>
<body>
<h1>Vanta Roadmap</h1>
<p class="meta">Updated ${esc(data.updated)} &middot; ${data.items.length} items</p>
<div class="filters">
<label for="track-filter">Track:</label>
<select id="track-filter">
<option value="all">All tracks</option>
${trackOptions}
</select>
<label for="size-filter">Size:</label>
<select id="size-filter">
<option value="all">All sizes</option>
${sizeOptions}
</select>
<label for="model-filter">Model:</label>
<select id="model-filter">
<option value="all">All models</option>
${modelOptions}
</select>
</div>
<div class="board">${board}</div>
<details class="sh-section">
<summary>Shipped (${shipped.length})</summary>
<div class="sh-grid">${shipped.map(card).join("")}</div>
</details>
<script>${DRAG_JS}${JS}</script>
</body>
</html>`;
}
