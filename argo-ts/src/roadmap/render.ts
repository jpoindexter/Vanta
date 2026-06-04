import type { Roadmap, RoadmapItem } from "./schema.js";

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
  return `<div class="card s-${item.status}" data-track="${esc(item.track)}">
<div class="hd"><span class="sz">${esc(item.size)}</span><span class="ttl">${esc(item.title)}</span><span class="trk">${esc(item.track)}</span></div>
${routing(item) ? `<div class="badges">${routing(item)}</div>` : ""}
<p class="sum">${esc(item.summary)}</p>
<details><summary>Done criteria</summary><p class="done">${esc(item.done)}</p></details>
</div>`;
}

// Within a status column the cards are grouped by pickle-jar tier (rocks first),
// so the board reads top-priority-down. Untiered items fall into a trailing bucket.
function column(status: string, items: RoadmapItem[]): string {
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
  return `<div class="col"><h2 class="ch s-${status}">${COL_LABEL[status] ?? status}</h2>${groups}${tail}</div>`;
}

const CSS = `*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:1.5rem}
h1{font-size:1.4rem;margin-bottom:.4rem}
.meta{color:#64748b;font-size:.8rem;margin-bottom:1.25rem}
.filters{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:1.25rem}
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
@media(max-width:560px){.board{grid-template-columns:1fr}.sh-grid{columns:1}}`;

const JS = `(function(){
var cards=document.querySelectorAll('.card');
var tgs=document.querySelectorAll('.tg');
var cols=document.querySelectorAll('.col');
document.querySelectorAll('button[data-filter],button[data-track]').forEach(function(btn){
btn.addEventListener('click',function(){
document.querySelectorAll('button').forEach(function(b){b.classList.remove('active');});
this.classList.add('active');
var f=this.dataset.filter||this.dataset.track;
if(f==='all'){
cards.forEach(function(c){c.classList.remove('hidden');});
tgs.forEach(function(t){t.style.display='';});
cols.forEach(function(c){c.style.display='';});
}else{
cards.forEach(function(c){c.classList.toggle('hidden',c.dataset.track!==f);});
tgs.forEach(function(t){
var vis=[].some.call(t.querySelectorAll('.card'),function(c){return !c.classList.contains('hidden');});
t.style.display=vis?'':'none';
});
cols.forEach(function(c){
var vis=[].some.call(c.querySelectorAll('.tg'),function(t){return t.style.display!=='none';});
c.style.display=vis?'':'none';
});
}
});
});
})();`;

export function renderRoadmap(data: Roadmap): string {
  const tracks = [...new Set(data.items.map((i) => i.track))];
  const board = COLS.map((s) => column(s, data.items)).join("");
  const shipped = data.items.filter((i) => i.status === "shipped");
  const trackButtons = tracks
    .map((t) => `<button data-track="${esc(t)}">${esc(t)}</button>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Argo Roadmap · ${esc(data.updated)}</title>
<style>${CSS}</style>
</head>
<body>
<h1>Argo Roadmap</h1>
<p class="meta">Updated ${esc(data.updated)} &middot; ${data.items.length} items</p>
<div class="filters">
<button class="active" data-filter="all">All tracks</button>
${trackButtons}
</div>
<div class="board">${board}</div>
<details class="sh-section">
<summary>Shipped (${shipped.length})</summary>
<div class="sh-grid">${shipped.map(card).join("")}</div>
</details>
<script>${JS}</script>
</body>
</html>`;
}
