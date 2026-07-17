# Runtime resource usage ledger receipt

Date: 2026-07-17
Roadmap card: `RUNTIME-RESOURCE-USAGE-LEDGER`

## Shipped behavior

- Every recorded provider call now shares one call ID across the existing route ledger and the runtime resource ledger.
- Local runtime calls record controller, host, engine, model, selected profile and version, artifact hash, launch and request latency, active duration, tokens, throughput, memory/VRAM, cache/context state, and a bounded failure class when those values are available.
- Missing values are stored as explicit telemetry field names instead of zeros or invented estimates.
- Metered, included, local, and unknown billing modes remain attribution metadata. The resource ledger has no billed-cost field, so local estimates cannot masquerade as provider charges.
- The JSONL store is mode `0600`, deduplicates by call ID, ignores corrupt rows without hiding later receipts, strips secret-bearing route queries, and supports atomic confirmed retention pruning.
- `vanta local-model usage` exposes list, task/model/host/session filters, aggregate summary, JSON/CSV export, and confirmation-gated pruning.
- Desktop Runtime shows a compact Recorded usage band with call count, input/output tokens, active time, failures, and explicit missing-telemetry state in the existing detail tray.
- CLI, TUI, desktop, and interactive entry points attach the active roadmap/goal identity when one exists; missing goal context remains valid and never blocks a turn.

## Executed verification

```text
npm test -- --run src/ui/use-agent.test.ts src/agent/route-ledger.integration.test.ts src/cost/resource-ledger.test.ts src/cost/runtime-resource-capture.test.ts src/cli/runtime-resource-cmd.test.ts src/desktop/runtime-controller.test.ts desktop-app/src/runtime-strip.test.tsx
npm run typecheck
npm run desktop:renderer:typecheck
npm run vanta -- lint src/cost/resource-ledger.ts src/cost/runtime-resource-capture.ts src/cli/runtime-resource-cmd.ts src/agent/provider-usage.ts src/agent/turn-loop.ts desktop-app/src/runtime-strip.tsx src/desktop/runtime-state.ts src/desktop/runtime-controller.ts
npm run desktop:runtime-strip:smoke
npm run desktop:flow:proof
npm test -- --run
```

The focused regression gate passed 28 tests after the complete-suite fixture exposed and verified optional goal attribution. Both TypeScript checks passed. Eight touched modules passed Vanta's file, function, parameter, and complexity limits.

The real CLI proof seeded one sanitized local receipt through the production store, queried task/model/host aggregates through `vanta local-model usage`, exported CSV, verified the secret query and billed-cost field were absent, then pruned the row with explicit confirmation.

The runtime-strip smoke passed at `1440x960` and `760x900` in Ghost dark and light themes. The complete flow proof returned `ok: true` for source and Developer ID-signed packaged targets; both showed two recorded calls, token totals, and explicit missing telemetry alongside the existing runtime profile, download, recovery, queue, attachment, session, MCP, and responsive flows.

The final complete suite passed 1,406 test files and 13,351 tests with 3 skipped.
