#!/usr/bin/env python3
"""Generate a self-contained docs site for Argo — every canonical doc rendered
into one browsable, file://-safe page (sidebar nav, single-doc view, search).
No runtime fetch. Re-run after editing docs:

    python3 scripts/build-docs-site.py
"""
import re, html, pathlib
import mistune

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs-site" / "index.html"

# Curated, ordered manifest: section -> [(repo-relative path, nav title)].
# Missing files are skipped (the site never references a dead doc).
SECTIONS = [
    ("Start here", [
        ("README.md", "README"),
        ("MANIFESTO.md", "Manifesto"),
        ("SOUL.md", "Soul (identity)"),
        ("AGENT-MANIFESTO.md", "Agent manifesto"),
    ]),
    ("Vision & direction", [
        ("docs/prd.md", "PRD — product vision"),
        ("docs/living-operator.md", "Living operator (sentience direction)"),
        ("DECISIONS.md", "Decisions (locked choices)"),
    ]),
    ("Architecture", [
        ("CLAUDE.md", "Repo overview"),
        ("argo-ts/CLAUDE.md", "Agent layer (argo-ts)"),
        ("docs/argo-flow.md", "Runtime flow"),
        ("docs/self-repair-architecture.md", "Self-repair"),
        ("docs/factory-evolution.md", "Factory evolution"),
        ("docs/executive-dysfunction-brain-design.md", "EF brain design"),
        ("docs/ef-network-analysis.md", "EF network analysis"),
    ]),
    ("Capabilities", [
        ("docs/auto-router.md", "Auto-router (per-task models)"),
        ("docs/messaging-gateways.md", "Messaging gateways"),
        ("docs/plugin-framework.md", "Plugin framework"),
        ("docs/plugins-and-auth-browser.md", "Plugins & auth browser"),
        ("docs/tui-v2.md", "TUI v2 (mission control)"),
        ("docs/claude-code-parity-and-case-study.md", "Claude Code parity + case study"),
        ("docs/desktop-completion-plan.md", "Desktop completion plan"),
    ]),
    ("Roadmap & planning", [
        ("ROADMAP.md", "Roadmap (narrative)"),
        ("PARKED.md", "Parked ideas"),
        ("HANDOFF.md", "Handoff"),
    ]),
]

# External pages (already self-contained HTML elsewhere in the repo).
LINKS = [
    ("Interactive boards", [
        ("../roadmap.html", "Roadmap kanban"),
        ("../design-system-skills/index.html", "Design system skills (27)"),
        ("../ai-engineering-skills/index.html", "AI engineering skills (13)"),
    ]),
]

CSS = """
:root{--bg:#0b0f14;--panel:#11161d;--panel2:#0f141a;--line:#1f2933;--line2:#2a3744;
--ink:#c8d3de;--ink2:#8595a4;--ink3:#5d6b78;--acc:#7bb2a8;--acc2:#e0b341;--code:#0d1218}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
a{color:var(--acc);text-decoration:none}a:hover{text-decoration:underline}
.wrap{display:grid;grid-template-columns:290px 1fr;min-height:100vh}
nav{position:sticky;top:0;align-self:start;height:100vh;overflow-y:auto;background:var(--panel2);border-right:1px solid var(--line);padding:1.2rem 1rem}
nav h1{font:800 1rem/1.2 ui-monospace,monospace;letter-spacing:.1em;color:var(--acc2);margin:.1rem 0}
nav .sub{font-size:.72rem;color:var(--ink3);margin:.3rem 0 1rem;line-height:1.5}
nav input{width:100%;background:var(--code);border:1px solid var(--line2);color:var(--ink);border-radius:6px;padding:.45rem .6rem;font-size:.8rem;margin-bottom:.9rem}
nav .grp{font:700 .64rem/1 ui-monospace,monospace;letter-spacing:.13em;text-transform:uppercase;color:var(--ink3);margin:1rem 0 .35rem;padding-left:.1rem}
nav a.lnk{display:block;color:var(--ink2);padding:.3rem .5rem;border-radius:5px;font-size:.83rem;border-left:2px solid transparent;cursor:pointer}
nav a.lnk:hover{background:var(--panel);color:var(--ink);text-decoration:none}
nav a.lnk.active{background:var(--panel);color:var(--acc);border-left-color:var(--acc)}
nav a.lnk.hide{display:none}
main{padding:2.4rem 3.2rem;max-width:60rem}
.doc{display:none}.doc.on{display:block}
.doc h1{font-size:1.9rem;margin:0 0 .8rem}
.doc h2{font-size:1.25rem;margin:1.7rem 0 .6rem;color:var(--acc);border-bottom:1px solid var(--line);padding-bottom:.25rem}
.doc h3{font-size:1.05rem;margin:1.2rem 0 .4rem}
.doc h4{font-size:.92rem;margin:.9rem 0 .3rem;color:var(--ink2)}
.doc code{background:var(--code);border:1px solid var(--line);border-radius:4px;padding:.05rem .35rem;font:.85em ui-monospace,monospace;color:var(--acc2)}
.doc pre{background:var(--code);border:1px solid var(--line);border-radius:8px;padding:.9rem 1rem;overflow-x:auto}
.doc pre code{background:none;border:0;padding:0;color:var(--ink)}
.doc table{border-collapse:collapse;width:100%;margin:.8rem 0;font-size:.86rem}
.doc th,.doc td{border:1px solid var(--line2);padding:.4rem .6rem;text-align:left;vertical-align:top}
.doc th{background:var(--panel2);color:var(--acc);font-weight:700}
.doc blockquote{border-left:3px solid var(--acc);margin:.8rem 0;padding:.2rem 1rem;color:var(--ink2);background:var(--panel2)}
.doc hr{border:0;border-top:1px solid var(--line);margin:1.5rem 0}
.doc ul,.doc ol{padding-left:1.3rem}.doc li{margin:.2rem 0}
.crumb{font:.72rem ui-monospace,monospace;color:var(--ink3);margin-bottom:.6rem}
@media(max-width:880px){.wrap{grid-template-columns:1fr}nav{position:static;height:auto}main{padding:1.4rem}}
"""

JS = """
const links=[...document.querySelectorAll('a.lnk[data-doc]')],docs=[...document.querySelectorAll('.doc')];
function show(id){docs.forEach(d=>d.classList.toggle('on',d.id===id));
 links.forEach(l=>l.classList.toggle('active',l.dataset.doc===id));
 history.replaceState(null,'','#'+id);window.scrollTo(0,0);}
links.forEach(l=>l.addEventListener('click',e=>{e.preventDefault();show(l.dataset.doc);}));
const q=document.getElementById('q');
q.addEventListener('input',()=>{const t=q.value.toLowerCase();
 links.forEach(l=>l.classList.toggle('hide',t&&!l.textContent.toLowerCase().includes(t)));});
const init=(location.hash||'').slice(1);if(init&&document.getElementById(init))show(init);
"""

def slug(path):
    return re.sub(r"[^a-z0-9]+", "-", path.lower()).strip("-")

def main():
    md = mistune.create_markdown(plugins=["table", "strikethrough", "url"])
    nav, docs, first = [], [], None
    for sec, entries in SECTIONS:
        rows = []
        for rel, title in entries:
            f = ROOT / rel
            if not f.is_file():
                continue
            sid = slug(rel)
            if first is None:
                first = sid
            rows.append(f'<a class="lnk" data-doc="{sid}">{html.escape(title)}</a>')
            body = md(f.read_text())
            docs.append(
                f'<div class="doc" id="{sid}"><div class="crumb">{html.escape(sec)} · {html.escape(rel)}</div>{body}</div>')
        if rows:
            nav.append(f'<div class="grp">{html.escape(sec)}</div>' + "".join(rows))
    for sec, entries in LINKS:
        nav.append(f'<div class="grp">{html.escape(sec)}</div>' +
                   "".join(f'<a class="lnk" href="{href}">{html.escape(t)} ↗</a>' for href, t in entries))

    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Argo Docs</title>
<style>{CSS}</style></head><body><div class="wrap">
<nav><h1>ARGO DOCS</h1><div class="sub">A local trusted-operator agent. Knows the goal before it picks a tool, enforces scope on every action, reports only verified output.</div>
<input id="q" placeholder="Filter docs…" autocomplete="off">{''.join(nav)}</nav>
<main>{''.join(docs)}</main></div>
<script>{JS}
document.querySelector('.doc')&&document.querySelector('.doc').classList.add('on');
document.querySelector('a.lnk[data-doc]')&&document.querySelector('a.lnk[data-doc]').classList.add('active');
</script></body></html>"""
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(page)
    print(f"wrote {OUT} · {len(docs)} docs")

if __name__ == "__main__":
    main()
