# Vanta TUI v2 — mission-control surface (non-destructive)

> Roadmap: `TUI-V2` + `TUI-V2-PALETTE` + `TUI-V2-RAILS`. Design source: the mockup Vanta built
> itself, `docs/hermes-model-v2.html` (open it to see all screens). Goal: build v2 **without
> overwriting the working v1 TUI.**

## The non-overwrite strategy (the core constraint)

The shipped v1 TUI (`tui/app.tsx`, `app-reducer.ts`, `transcript.tsx`, …) works and stays the
default. v2 ships as a **separate, opt-in surface**:
- New module `tui/v2/` (own `app-v2.tsx` etc.) — v1 files are not edited.
- Launch via `ARGO_TUI=v2` (env) or a `/tui v2` toggle; default remains v1.
- Reuse the shared layer (reducer state shape, stream events, slash catalog) read-only; v2 is a
  new *view*, not a rewrite of the engine.
- Promote v2 to default only after Jason confirms it; v1 stays as fallback (`ARGO_TUI=v1`).

This means zero regression risk: a broken v2 never touches the working path.

## What v2 adds (from the mockup)

A 3-column operator/mission-control surface:

- **Left rail — durable state:** active goal, main model, vision aux, scope, context-budget meter
  (e.g. `38k / 1.0M · low load`), branch/kernel.
- **Center — work:** active goal banner + transcript with risk-tagged tool calls, plan/todo
  visibility, streaming with "checking output before I call it done" honesty.
- **Right rail — safety + memory:** the **safety rail** (live ALLOW/ASK/BLOCK for the current
  context) + **working-memory** panel (the few things held in mind) + **live telemetry**
  (tokens / cost / time).

### `TUI-V2-PALETTE` — risk-labeled slash palette
Categorized, fuzzy-searchable, and each command row shows its **risk/purpose**: local vs
kernel-gated vs approval-gated (e.g. `/commit` = approval-gated, `/status` = local). Reduces hidden
state + choice load — pairs with `EF-CHOICEREDUCE`.

### `TUI-V2-RAILS` — state/safety/memory/telemetry rails
The left durable-state rail + right safety-rail + working-memory + telemetry. Composes existing
shipped/captured work: `COST-VISIBLE` (telemetry), `EF-WORKINGMEM` (working memory),
`AUTO-ROUTER` (visible model routing), `THINK-FOLD`/`CC-TRANSCRIPT` (risk-tagged collapsible tool
calls). v2 is mostly a *surface* that makes already-built state visible.

## Done

`TUI-V2`: `ARGO_TUI=v2` launches the 3-column mission-control TUI (state / transcript /
safety+working-memory, risk-labeled palette, visible routing, live telemetry) while the default v1
TUI is byte-for-byte unchanged and still launches by default.
