# Desktop runtime controller strip

**Roadmap:** `DESKTOP-RUNTIME-CONTROLLER-STRIP`  
**Implemented:** 2026-07-17

## Outcome

The desktop Work surface now includes a 35 px runtime strip below the run controls. It consumes Vanta's normalized runtime controller contract and keeps the active host, model, engine, lifecycle state, memory pressure, throughput, queued-turn count, and kernel trust visible without opening a dashboard or leaving the transcript.

The disclosure opens a contextual runtime panel in place. It separates controller transport reachability from kernel boundary readiness, shows current/stale observation state, and switches the active runtime host for the current desktop session. Switching updates only the runtime selection; the active composer draft remains intact.

## Controller bridge

The loopback-only `/api/runtime` GET/POST route bridges the existing controller contract into the desktop renderer:

- the local host observes persisted Vanta-managed runtime engine state, system memory pressure, the latest provider-turn throughput receipt, current queue depth, and the actual root-matched kernel status;
- configured remote hosts come from `VANTA_RUNTIME_HOSTS` and expose only normalized controller snapshots;
- host selection is stored by active desktop session, not as a global provider mutation;
- model paths, host endpoints, credential references, bearer values, raw controller errors, and receipt prompts/responses never cross the desktop API;
- invalid or missing remote configuration degrades to the local host rather than breaking Work.

## Interaction and responsive behavior

The strip uses one stable disclosure button with an accessible `aria-controls` relationship. The detail surface is a non-modal dialog, host choices expose pressed state, outside click closes it, and Escape closes it while returning focus to the trigger.

At desktop width, every runtime signal remains visible. At compact widths, lower-priority engine, pressure, throughput, and trust labels collapse in order while host, model, queue, and disclosure remain. The compact Work screenshot was visually inspected after closing the inspector; the strip remained visible, aligned, and unclipped in Ghost light mode.

## Verification

Executed:

```bash
npx vitest run src/desktop desktop-app/src --maxWorkers=1
npm run desktop:renderer:typecheck
npm run typecheck
npm run desktop:runtime-strip:smoke
```

Results:

- 29 desktop test files / 97 tests passed;
- renderer and core TypeScript checks passed;
- the production Vite renderer built successfully;
- Electron proved 1440 px dark and light themes plus a 760 px compact layout;
- the strip held a 35 px height with no component or page horizontal overflow;
- a typed draft survived a local-to-remote runtime switch;
- Escape closed detail and restored trigger focus;
- Electron role queries and DOM semantics proved the dialog label, non-modal state, host-switch group label, and pressed selection state.

This proves the runtime strip behavior in the actual Electron renderer with deterministic controller fixtures and the loopback API with real integration tests. It does not claim a live remote controller deployment or a physical VoiceOver/NVDA session; those remain release-environment proofs.
