# Hermes current-main delta - 2026-07-12

## Scope

- Current Hermes: `NousResearch/hermes-agent@4281151ae859241351ba14d8c7682dc67ff4c126`
- Prior Vanta audit pin: `3b2ef789dfcf92f5b7b18c08c59d25948e50857f`
- Range inspected: 33 commits and 78 changed files
- Vanta evidence: current `roadmap.json` and production call sites at `cafca4ea`

This is a delta audit, not another feature-count comparison. A Hermes change
earns a Vanta card only when the user outcome is missing and aligns with the
one-owner, kernel-gated operator direction.

## Material gaps

| Priority | Hermes evidence | Vanta finding | Roadmap action |
| --- | --- | --- | --- |
| 1 | `a0a6cd80` preserves `none` versus `unknown` effects for interrupted or dangling tools. | Shipped: Vanta persists `pending`/`started` boundaries, classifies canonical results as `none`/`confirmed`/`unknown`, and repairs dangling sessions with inspect-before-retry guidance. | `HERMES-DELTA-EFFECT-DISPOSITION` (`shipped`) |
| 2 | `32f30d2a` through `83000c72` judge compaction against the next real prompt count and stop ineffective loops. | Shipped: Vanta evaluates the next billed/preflight input count, suppresses a third automatic pass after two high readings, counts no-op boundaries, and leaves focused manual compaction available. | `HERMES-DELTA-COMPACTION-REAL-HEADROOM` (`shipped`) |
| 3 | `cb7f6bbb` through `0d63c23f` persist per-call model/provider/base-route usage, including included and fallback calls. | Shipped: a versioned call ledger records actual served routes, fallback depth, billing status, token dimensions, and known/unknown/zero costs; route-aware operator views do not combine it with legacy turn spend. | `HERMES-DELTA-USAGE-ROUTE-LEDGER` (`shipped`) |
| 4 | `ce5c1f9f` and `aac77f16` keep picker model changes session-scoped. | Shipped: typed, TUI, and desktop switches default to session scope; provider/model metadata survives resume, while only explicit `--global`/Set as default mutates `.env`. | `HERMES-DELTA-SESSION-MODEL-SCOPE` (`shipped`) |
| 5 | `4df6e628` through `4281151a` run context-reference expansion through the gateway under the routed profile and effective model budget. | Shipped: local and gateway messages share one bounded preprocessor; remote expansion occurs before queueing under the message root/profile and routed-model budget, with source and warning receipts. | `HERMES-DELTA-GATEWAY-CONTEXT-REFS` (`shipped`) |
| 6 | `f9728af5` and `6142203b` add authenticated, bounded runtime readiness while preserving cheap liveness. | Shipped: unauthenticated `/api/v1/live` runs before session allocation; authenticated `/api/v1/readiness` and `/status` report bounded, redacted runtime checks without setup or token/state-store writes. | `HERMES-DELTA-AUTH-READINESS` (`shipped`) |

## No new card

| Hermes delta | Decision |
| --- | --- |
| Fireworks provider | Already built into Vanta's provider catalog and OpenAI-compatible resolver. |
| Primary credential-pool restoration after fallback | Hermes mutates one agent runtime across providers. Vanta composes an immutable primary pool wrapper before its fallback chain, so each call starts from the correct primary. |
| Current unauthenticated provider remains visible in pickers | Vanta's desktop provider inventory always includes the configured catalog entry and marks the current provider independently of key readiness. |
| Per-model usage formatting primitives | Vanta already has them, but they are not wired. That is captured as a wiring and durability card rather than a duplicate feature. |
| New skill packs or consumer integrations | This 33-commit range adds no material new skill family. The existing skill-catalog audit remains sufficient. |

## Build order

All six local delta cards are shipped. The ten existing parked cards remain external acceptance
work requiring real credentials, services, or hardware.
