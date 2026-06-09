---
name: ship-preflight
description: "Pre-deploy gate: typecheck (must exit 0) -> full test suite (all pass) -> build. Any red = stop and report which gate failed. Green = print the deploy command, never run it."
created: 2026-06-07
updated: 2026-06-07
tags: [deploy, ship, preflight, gate, tests, typecheck, build, release, safety]
---

# Ship Preflight

A blocking gate before any deploy / notarize / release — mined from your own most-repeated rule ("typecheck exit 0; tests ALL pass; then build"). Deploy/ship is your widest theme; make the gate one command that refuses to pass on red.

## When to use

Before any deploy, notarize, publish, or release. Run it as the first step of a ship flow, or schedule it pre-deploy.

## Procedure

1. **Typecheck** via `shell_cmd` (e.g. `tsc --noEmit`, `cargo check`). Must **exit 0**.
2. **Full test suite.** **ALL** must pass — not "most", not "the ones I changed".
3. **Build.** Must succeed.

Run in order; capture each gate's result.

## The gate

- **Any red -> STOP.** Report exactly which gate failed, and the error. Do not continue; do not deploy.
- **All green -> print the deploy command, do NOT run it.** Deploy is irreversible and human-authorized; the preflight proves readiness, it doesn't ship. Surface the command for the user to run or approve.

## Never

Deploy, publish, notarize, or push a release tag automatically. The kernel gates these; the preflight stops at "ready — here's the command".

## Run it

- One-shot before shipping: `vanta run "ship preflight for <project>: typecheck (exit 0) -> full tests (all pass) -> build; green prints the deploy command, never runs it"`.

## Attribution

Mined from your own repeated ship gate (build-catalog §9), aligned with Boris Cherny's verification-as-bottleneck frame (14:37). Solo-oriented: prove readiness, the human ships.
