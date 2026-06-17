#!/usr/bin/env python3
"""Generic skill-folder → self-contained index.html generator (file://-safe, no
fetch). Renders every SKILL.md in a folder into one navigable page. Usage:

    python3 scripts/build-skills-index.py ai-engineering-skills

A per-folder CONFIG below sets the title, subtitle, and sidebar grouping.
"""
import re, html, sys, pathlib
import mistune

ROOT = pathlib.Path(__file__).resolve().parent.parent

CONFIG = {
    "ai-engineering-skills": {
        "title": "AI Engineering Skills",
        "subtitle": "Production LLM & agent engineering — harness, inference, caching, "
                    "RAG, evals, observability, safety. Web · API · agents · at scale.",
        "groups": [
            ("Context & harness", ["harness-and-context-engineering", "adaptation-strategies"]),
            ("Inference & serving", ["inference-performance", "inference-caching-and-kv",
                                     "quantization-and-model-compression"]),
            ("Reliability & agents", ["structured-output-and-tool-calling",
                                      "agent-reliability-and-guardrails", "model-routing-and-fallback"]),
            ("Retrieval & evals", ["rag-architecture", "llm-evals-and-retrieval-quality"]),
            ("Ops, cost & safety", ["llm-observability-and-cost", "llm-safety-and-multitenancy",
                                    "production-failure-modes-and-tradeoffs"]),
        ],
    },
}

FM = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)

def parse(md):
    m = FM.match(md)
    meta, body = {}, md
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip()
        body = md[m.end():]
    return meta, body

def title_of(meta, body, slug):
    m = re.search(r"^#\s+(.+)$", body, re.MULTILINE)
    return m.group(1).strip() if m else meta.get("name", slug)

CSS = """
:root{--bg:#0b0f14;--panel:#11161d;--panel2:#0f141a;--line:#1f2933;--line2:#2a3744;
--ink:#c8d3de;--ink2:#8595a4;--ink3:#5d6b78;--acc:#7bb2a8;--acc2:#e0b341;--code:#0d1218}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
a{color:var(--acc);text-decoration:none}a:hover{text-decoration:underline}
.wrap{display:grid;grid-template-columns:300px 1fr;min-height:100vh}
nav{position:sticky;top:0;align-self:start;height:100vh;overflow-y:auto;background:var(--panel2);border-right:1px solid var(--line);padding:1.2rem 1rem}
nav h1{font:800 1rem/1.2 ui-monospace,monospace;letter-spacing:.09em;color:var(--acc2);margin:.1rem 0}
nav .sub{font-size:.72rem;color:var(--ink3);margin:.3rem 0 1rem;line-height:1.5}
nav input{width:100%;background:var(--code);border:1px solid var(--line2);color:var(--ink);border-radius:6px;padding:.45rem .6rem;font-size:.8rem;margin-bottom:.9rem}
nav .grp{font:700 .64rem/1 ui-monospace,monospace;letter-spacing:.13em;text-transform:uppercase;color:var(--ink3);margin:1rem 0 .35rem;padding-left:.1rem}
nav a.lnk{display:block;color:var(--ink2);padding:.3rem .5rem;border-radius:5px;font-size:.83rem;border-left:2px solid transparent}
nav a.lnk:hover{background:var(--panel);color:var(--ink);text-decoration:none}
nav a.lnk.hide{display:none}
main{padding:2.4rem 3.2rem;max-width:62rem}
.lede{border-bottom:1px solid var(--line);padding-bottom:1.6rem;margin-bottom:1.4rem}
.lede h1{font-size:2rem;margin:0 0 .5rem}.lede p{color:var(--ink2);max-width:48rem}
.bar{display:flex;gap:.6rem;margin:1rem 0 0}
.bar button{background:var(--panel);border:1px solid var(--line2);color:var(--ink2);padding:.3rem .7rem;border-radius:6px;cursor:pointer;font-size:.78rem}
.bar button:hover{color:var(--ink);border-color:var(--acc)}
details.skill{background:var(--panel);border:1px solid var(--line);border-radius:10px;margin:.7rem 0;overflow:hidden}
details.skill.hide{display:none}
summary{list-style:none;cursor:pointer;padding:1rem 1.2rem;display:flex;align-items:baseline;gap:.8rem}
summary::-webkit-details-marker{display:none}
summary .tt{font:700 1.05rem/1.3 -apple-system,sans-serif;color:var(--ink)}
summary .dd{font-size:.82rem;color:var(--ink3);flex:1}
summary .ix{font:700 .7rem ui-monospace,monospace;color:var(--acc2);border:1px solid var(--line2);border-radius:4px;padding:.05rem .4rem}
details[open] summary{border-bottom:1px solid var(--line)}
.body{padding:.4rem 1.6rem 1.6rem}
.body h1{font-size:1.5rem;margin:1.4rem 0 .6rem}
.body h2{font-size:1.18rem;margin:1.5rem 0 .5rem;color:var(--acc);border-bottom:1px solid var(--line);padding-bottom:.25rem}
.body h3{font-size:1rem;margin:1.1rem 0 .4rem}.body h4{font-size:.9rem;margin:.9rem 0 .3rem;color:var(--ink2)}
.body code{background:var(--code);border:1px solid var(--line);border-radius:4px;padding:.05rem .35rem;font:.85em ui-monospace,monospace;color:var(--acc2)}
.body pre{background:var(--code);border:1px solid var(--line);border-radius:8px;padding:.9rem 1rem;overflow-x:auto}
.body pre code{background:none;border:0;padding:0;color:var(--ink)}
.body table{border-collapse:collapse;width:100%;margin:.8rem 0;font-size:.86rem}
.body th,.body td{border:1px solid var(--line2);padding:.4rem .6rem;text-align:left;vertical-align:top}
.body th{background:var(--panel2);color:var(--acc);font-weight:700}
.body blockquote{border-left:3px solid var(--acc);margin:.8rem 0;padding:.2rem 1rem;color:var(--ink2);background:var(--panel2)}
.body hr{border:0;border-top:1px solid var(--line);margin:1.4rem 0}
.body ul,.body ol{padding-left:1.3rem}.body li{margin:.2rem 0}
@media(max-width:880px){.wrap{grid-template-columns:1fr}nav{position:static;height:auto}main{padding:1.4rem}}
"""

JS = """
const q=document.getElementById('q'),skills=[...document.querySelectorAll('details.skill')],links=[...document.querySelectorAll('a.lnk')];
q.addEventListener('input',()=>{const t=q.value.toLowerCase();
 skills.forEach(s=>{const hit=s.dataset.search.includes(t);s.classList.toggle('hide',t&&!hit);if(t&&hit)s.open=true;});
 links.forEach(l=>l.classList.toggle('hide',t&&!l.dataset.search.includes(t)));});
document.getElementById('xall').onclick=()=>skills.forEach(s=>s.open=true);
document.getElementById('call').onclick=()=>skills.forEach(s=>s.open=false);
"""

def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else "ai-engineering-skills"
    cfg = CONFIG[folder]
    base = ROOT / folder
    md = mistune.create_markdown(plugins=["table", "strikethrough", "url"])
    skills = {}
    for d in sorted(base.iterdir()):
        f = d / "SKILL.md"
        if f.is_file():
            skills[d.name] = parse(f.read_text())

    nav, sections, ordered, placed = [], [], [], set()
    for gname, slugs in cfg["groups"]:
        nav.append(f'<div class="grp">{html.escape(gname)}</div>')
        for slug in slugs:
            if slug in skills:
                ordered.append((slug, skills[slug])); placed.add(slug)
                meta, body = skills[slug]; t = title_of(meta, body, slug)
                nav.append(f'<a class="lnk" href="#{slug}" data-search="{html.escape((t+" "+meta.get("description","")).lower())}">{html.escape(t)}</a>')
    for slug, v in skills.items():
        if slug not in placed:
            ordered.append((slug, v))
            meta, body = v; t = title_of(meta, body, slug)
            nav.append(f'<a class="lnk" href="#{slug}" data-search="{html.escape(t.lower())}">{html.escape(t)}</a>')

    for n, (slug, (meta, body)) in enumerate(ordered, 1):
        t = title_of(meta, body, slug); desc = meta.get("description", "")
        search = html.escape((t + " " + desc + " " + meta.get("tags", "")).lower())
        sections.append(
            f'<details class="skill" id="{slug}" data-search="{search}">'
            f'<summary><span class="ix">{n:02d}</span><span class="tt">{html.escape(t)}</span>'
            f'<span class="dd">{html.escape(desc)}</span></summary>'
            f'<div class="body">{md(body)}</div></details>')

    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(cfg['title'])}</title>
<style>{CSS}</style></head><body><div class="wrap">
<nav><h1>{html.escape(cfg['title'])}</h1><div class="sub">{html.escape(cfg['subtitle'])}</div>
<input id="q" placeholder="Filter skills…" autocomplete="off">{''.join(nav)}</nav>
<main><div class="lede"><h1>{html.escape(cfg['title'])}</h1>
<p>{len(ordered)} reference-grade, self-contained skills (the same <code>SKILL.md</code> files installable into Vanta). Click a card to expand.</p>
<div class="bar"><button id="xall">Expand all</button><button id="call">Collapse all</button></div></div>
{''.join(sections)}</main></div><script>{JS}</script></body></html>"""
    out = base / "index.html"
    out.write_text(page)
    print(f"wrote {out} · {len(ordered)} skills")

if __name__ == "__main__":
    main()
