---
id: modularity
title: Modularity & architecture
sidebar_position: 6
---

# Modularity & architecture

Modularity is the standard in Vanta, enforced by construction — not aspiration. Three things hold it together: **swappable ports** (you change a backend by changing an env var, never code), an **architectural fitness function** (a size gate that runs before every merge), and **path-scoped rules** that inject domain constraints per area of the codebase.

## Ports & adapters

Every external dependency sits behind an interface (a *port*); concrete implementations (*adapters*) register themselves and are selected at runtime from the environment. The agent loop only ever sees the interface.

| Port (interface) | Selected by | Add an adapter |
|------------------|-------------|----------------|
| `LLMProvider` (`providers/interface.ts`) | `resolveProvider(env)` reads `VANTA_PROVIDER` | implement the interface, add to the `PROVIDERS` map in `providers/index.ts` |
| `Tool` (`tools/types.ts`) | `buildRegistry()` over `ALL_TOOLS` | new `tools/<name>.ts`, add to `tools/all-tools.ts` |
| `SearchProvider` (`search/interface.ts`) | `resolveSearchProviders(env)` reads `VANTA_SEARCH_PROVIDER` | implement the interface, add a case in `search/index.ts` |
| Memory store (`store/home.ts`) | `resolveVantaHome(env)` reads `VANTA_HOME` | filesystem store, git-versioned by design |
| Tool scope (`agent/tool-scope.ts`) | per call; `VANTA_TOOL_SCOPE=0` disables | — |

The pattern is always the same: one `resolve*()` reads a single env var, matches a registry, returns the adapter. No singletons — every run resolves fresh. See [Extending Vanta](./extending.md) for full walkthroughs.

## The fitness function — the size gate

The enforced architectural rule is a **code-size gate** (`lint/size.ts`, via the TypeScript compiler API — no regex guessing):

| Limit | Value |
|-------|-------|
| File | ≤ 300 lines (soft target 200) |
| Function | ≤ 50 lines |
| Parameters | ≤ 4 (else an options object) |
| Cyclomatic complexity | ≤ 10 |

It runs in three places, so violations can't accumulate:

1. **Pre-commit** — `vanta lint --staged` hard-blocks oversized staged TS (set `VANTA_LINT_BLOCK=0` to warn-only).
2. **`npm test`** — the gate's own tests run with the suite.
3. **In-agent** — `write_file` runs the gate on every TS write and reports violations inline, so the agent born-small and self-corrects.

`LIMITS` is a `const` — no per-file overrides; the only exemptions are tests and `.d.ts`. Changing the gate goes through code review.

> Why it matters: small files stay testable and swappable; the gate is what keeps the ports-and-adapters shape from eroding over time.

## Path-scoped rules

`~/.vanta/rules/*.md` files (optional YAML frontmatter `paths: [glob]`) inject constraints into the prompt. Always-on rules (no `paths`) apply everywhere; scoped rules apply only when the active files match the globs. Informational (read by the agent), not blocking.

## The boundary stays separate

The Rust kernel (`src/`) never changes behavior based on agent output — it's the [safety boundary](./safety-model.md). The TypeScript agent layer orchestrates and stays small. A bug in the larger layer can't grant itself authority; it can only ask the kernel.
