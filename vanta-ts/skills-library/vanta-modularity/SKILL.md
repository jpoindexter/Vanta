---
name: vanta-modularity
description: "Author new Vanta capabilities as ports + adapters so anything can be swapped or upgraded without touching consumers. Use when adding a swappable capability (provider, engine, store, transport) or refactoring a coupled one."
created: 2026-06-17
updated: 2026-06-17
tags: [architecture, ports, adapters, modularity, refactor, boundaries, vanta]
---

# Vanta Modularity — ports & adapters

Vanta's standard (DECISIONS 2026-06-17): every swappable concern sits behind an **interface (port)**; concrete impls are **adapters**; consumers depend only on the port and resolve the active impl in **one place**. Swap or upgrade = a new adapter + one registration line, **zero consumer edits**. Enforced by `lint/boundaries.ts` (runs in `npm test` via `architecture.test.ts` and in the pre-commit hook).

## When to use

Adding a capability that could have more than one implementation (an LLM/search/code-intel engine, a brain, a store, a transport, a messaging platform), or refactoring something consumers currently `new` or import concretely.

## The pattern (copy an existing port)

Reference ports already in the repo — read one before writing a new one:
- `providers/` — `LLMProvider` + `resolveProvider(env)` (the original)
- `search/` — `SearchProvider` + `resolveSearchProvider(env)`
- `code-intel/` — `CodeIntelProvider` + `resolveCodeIntelProvider(env)` (interface/adapter/null/resolver split)
- `brain/` — `Brain` + `resolveBrain(env)` (facade fronted by a port)
- `safety-client.ts` — `KernelClient` + `createKernelClient()` factory + `HttpSafetyClient` adapter
- `tools/registry.ts` — `ToolRegistry` + `createToolRegistry()` + `MapToolRegistry`

### Steps

1. **Port** — `<area>/interface.ts`: the interface every impl satisfies. Types only; no impl.
2. **Adapter** — `<area>/<impl>.ts`: a class/object implementing the port. This is the ONLY file that touches the concrete dependency (a binary, an SDK, `fetch`).
3. **Resolver/factory** — `<area>/index.ts`: `resolve<Area>(env)` or `create<Area>()` picks/builds the active adapter. The one construction site. Add a null-object adapter when "off" should be a graceful no-op (see `code-intel/null.ts`).
4. **Consumers** — depend on the port; call the resolver. Never import the adapter, never `new` it.
5. **Enforce** — add a rule to `RULES` in `lint/boundaries.ts` (`forbid` regex + `appliesTo`). Pre-existing violations go in `GRANDFATHER` (shrink-only). Run `npx tsx src/lint/boundaries.ts`.
6. **Docs** — add the port to the file map + the "Modularity standard" section in `vanta-ts/CLAUDE.md`.

## Rules

- Errors are values: port methods may throw, but tool/consumer adapters catch and return `{ok,false}` — never break the agent loop. Provide graceful degrade when the impl is absent.
- Keep the back-compat alias when renaming a widely-imported type (e.g. `SafetyClient = KernelClient`) so type-import sites need zero churn — only construction sites move to the factory.
- The Rust kernel (`src/`) is the deliberate exception: a FIXED boundary, never made swappable. Only its TS client is a port.
- Don't pre-build a port for a concern with one impl and no plausible second (rule of 3) — but Vanta's direction is "born modular," so new swappable capabilities get a port up front.

## Done

A new impl drops in via one adapter + one resolver case; `npm test` (architecture.test.ts) stays green; no consumer or core file imports the concrete adapter.
