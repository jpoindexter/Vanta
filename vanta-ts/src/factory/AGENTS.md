# AGENTS.md — vanta-ts/src/factory/

Purpose: bounded autonomous self-improvement loop. One reviewable slice per cycle.

## Key interfaces

- `triage(root)` → `WorkItem | null` — what to work on (use `selectWorkItem` for tests)
- `buildPlan(item, root)` → `FactoryPlan` — how to do it (pure)
- `execute(root, plan, budget)` → `SliceArtifact` — does the work
- `verify(root, artifact, preExisting)` → `VerifyResult` — trust gate
- `runCycle(config, log)` → `CycleResult` — full cycle

## Do not write to this folder

`vanta-ts/src/factory/*.ts` files are kernel-protected. Any write attempt returns `Risk::Block`.

## Tests

All pure logic has co-located unit tests (`*.test.ts`). Run: `cd vanta-ts && npx vitest run src/factory/`
