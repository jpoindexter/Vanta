# UI-TARS-desktop — desktop/operator reference (to inspect)

Source: user pointer — `github.com/bytedance/UI-TARS-desktop` (ByteDance, TypeScript, Apache-2.0, ~29k stars). An open-source **multimodal desktop/browser agent**: screenshot perception + keyboard/mouse actions + local computer control — an agent that operates apps *visually*, not just via chat/tools. This doc captures why it matters for Vanta + what to mine; internals are **unverified** (not yet read) and marked accordingly.

## Why it matters for Vanta
Overlaps Vanta's future **desktop/operator** direction (the `DESKTOP-*` track). The borrowable ideas (Apache-2.0, so license-compatible to learn from):
1. **Desktop action model** — how click/type/scroll/observe loops are represented as a schema. → `DESKTOP-ACTION-SCHEMA`
2. **Vision-to-action** — how a screenshot becomes a safe, grounded action (element grounding, coordinate vs semantic targeting). → `DESKTOP-VISION-TO-ACTION`
3. **Local-control boundary** — patterns for letting an agent drive a real desktop *without going feral* (scoping, confirmation, kill-switch). This is exactly where Vanta's **kernel gate** should sit. → `DESKTOP-CONTROL-BOUNDARY`

## To inspect before Vanta's DESKTOP work (unverified)
- The action schema (what primitives: click/double/right/drag/type/key/scroll/wait/screenshot) and how targets are specified (pixel coords vs accessibility tree vs vision grounding).
- The perception loop (screenshot cadence, diffing, when it re-observes vs acts blind).
- Safety gates: what's auto vs confirmed, any allow/deny, any sandbox/scope on which apps/regions it may touch.
- How it recovers from a mis-click / stale screen.

## Vanta fit
Vanta already has `screenshot`, `look_at_screen`, `browser_navigate/extract`, `describe_image` (vision-in) — but no **action-out** to the OS (click/type). The kernel's `assess()` is the natural gate for desktop actions (every click/type assessed, irreversible/destructive UI actions escalate). The `DESKTOP-*` cards capture the build path; this repo is the reference for the action schema + grounding, NOT a dependency to bolt in.
