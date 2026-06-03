# Interactive Product Roadmap — Design (2026-06-03)

## Problem

`ROADMAP.md` is the build-order source of truth, but it has grown to ~190 lines of
jumbled version sections. Two needs aren't met:

1. **Jason** can't see "shipped / building / on the horizon" at a glance.
2. **Argo** can't read its own roadmap as structured data — to know its status, or
   (later) for the factory to pick the next item.

Standing directive from this session: **all Argo documentation must be agent-ready** —
a structured, parseable source with human views *generated from it*, never the reverse.

## Done (v1)

- [ ] `roadmap.json` exists at repo root, seeded from the current `ROADMAP.md`, holding every track item.
- [ ] `roadmap.html` is generated from it — a Now / Next / Later product roadmap, filterable, opens in a browser.
- [ ] `argo roadmap` builds + opens the HTML.
- [ ] Argo reads `roadmap.json` natively (agent-ready) — verified by the agent answering "what's on your roadmap" from the file.
- [ ] Generator is pure + unit-tested; `tsc` clean.

## Architecture

Single source → two consumers:

```
roadmap.json   ← single source of truth (agent-ready)
   │
   ├─▶ roadmap.html   (generated; human view — Jason)
   └─▶ Argo reads it directly (agent view — already agent-ready JSON)
```

### Data model — `roadmap.json`

```json
{
  "updated": "2026-06-03",
  "items": [
    {
      "id": "MCP-1",
      "track": "MCP: use · make · serve",
      "title": "Use any MCP (consume)",
      "status": "building",
      "size": "S",
      "summary": "Fix config discovery: accept mcpServers key + ./.mcp.json + argo mcp list.",
      "done": "argo mcp list shows a server's tools; Argo calls one live."
    }
  ]
}
```

- `status` ∈ `shipped | building | next | horizon`.
- Column mapping: `building → Now`, `next → Next`, `horizon → Later`, `shipped → a
  collapsed "Shipped" lane`.
- Zod schema validates at the boundary (rejects bad status / missing fields).

### Modules — `argo-ts/src/roadmap/`

| File | Kind | Role |
|------|------|------|
| `schema.ts` | pure | Zod schema + types for `roadmap.json` |
| `render.ts` | pure | `renderRoadmap(data) → string` — self-contained HTML (inline CSS/JS, no deps). Now/Next/Later columns, track grouping, status-colored cards, click-to-expand `done`, filter by track/status. Unit-tested. |
| `build.ts` | I/O | read `roadmap.json` (repo root) → validate → write `roadmap.html` |

CLI: `argo roadmap` → `build.ts` then `open roadmap.html` (macOS `open`).

### Agent-ready

`roadmap.json` is plain structured JSON at repo root → Argo reads it with its existing
read tool. No special tool needed for v1. (Future, parked: surface a roadmap digest into
the system prompt so Argo always knows its status; let the factory pick the next
`next`-status item.)

## Why json-as-source (not parse the md)

Parsing ~190 lines of freeform markdown reliably is fragile. Inverting it — JSON is the
structured source, the md becomes narrative — yields one agent-ready source and a clean
generated human view. This is the concrete instance of "all docs agent-ready."

## Drift

`ROADMAP.md` narrative and `roadmap.json` status can drift. v1 accepts this: JSON is
canonical for *status*; the md stays as narrative/rationale. Auto-rendering a status-board
table back into the md is an easy fast-follow if drift bites.

## Testing

- `render.ts` — pure: each status lane renders; HTML escapes `summary`/`done`; empty roadmap is valid.
- `schema.ts` — rejects bad `status`, missing required fields.
- `build.ts` — integration: fixture JSON → HTML file written.

## Out of scope (→ PARKED)

- Cockpit (`:7788`) live panel.
- md ↔ json auto-sync.
- Editing the roadmap from the HTML (read-only view).
- Factory auto-picking the next item.

## Relationship to the rest of the work

This is **slice 1**. `roadmap.json` captures *every* track — including the three MCP
phases already added to `ROADMAP.md` — so building this tool inherently "captures all of
it." MCP-1 → MCP-2 → MCP-3 follow as their own slices and will appear in the roadmap view
the moment it exists.
