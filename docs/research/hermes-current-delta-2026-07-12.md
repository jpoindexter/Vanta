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
| 1 | `a0a6cd80` preserves `none` versus `unknown` effects for interrupted or dangling tools. | Vanta avoids automatic retries for known mutators, but exceptions and interrupted tails have no durable effect disposition. | `HERMES-DELTA-EFFECT-DISPOSITION` (`next`) |
| 2 | `32f30d2a` through `83000c72` judge compaction against the next real prompt count and stop ineffective loops. | Vanta's anti-thrash gate measures estimated before/after message savings, which cannot detect an incompressible system/tool-schema floor. | `HERMES-DELTA-COMPACTION-REAL-HEADROOM` (`next`) |
| 3 | `cb7f6bbb` through `0d63c23f` persist per-call model/provider/base-route usage, including included and fallback calls. | Vanta's `CostDetail` helper is test-only and the durable spend ledger drops zero or unknown-cost calls. | `HERMES-DELTA-USAGE-ROUTE-LEDGER` |
| 4 | `ce5c1f9f` and `aac77f16` keep picker model changes session-scoped. | Vanta hot-swaps correctly, but every `/model` selection persists to `.env` and can bleed into concurrent/future sessions. | `HERMES-DELTA-SESSION-MODEL-SCOPE` |
| 5 | `4df6e628` through `4281151a` run context-reference expansion through the gateway under the routed profile and effective model budget. | Vanta context references execute only in the TUI submit path; inbound channel messages bypass them. | `HERMES-DELTA-GATEWAY-CONTEXT-REFS` |
| 6 | `f9728af5` and `6142203b` add authenticated, bounded runtime readiness while preserving cheap liveness. | Vanta's authenticated `/api/v1/status` initializes conversation state and exposes only a shallow status snapshot. | `HERMES-DELTA-AUTH-READINESS` |

## No new card

| Hermes delta | Decision |
| --- | --- |
| Fireworks provider | Already built into Vanta's provider catalog and OpenAI-compatible resolver. |
| Primary credential-pool restoration after fallback | Hermes mutates one agent runtime across providers. Vanta composes an immutable primary pool wrapper before its fallback chain, so each call starts from the correct primary. |
| Current unauthenticated provider remains visible in pickers | Vanta's desktop provider inventory always includes the configured catalog entry and marks the current provider independently of key readiness. |
| Per-model usage formatting primitives | Vanta already has them, but they are not wired. That is captured as a wiring and durability card rather than a duplicate feature. |
| New skill packs or consumer integrations | This 33-commit range adds no material new skill family. The existing skill-catalog audit remains sufficient. |

## Build order

1. Preserve unknown tool effects before retry/replay cleanup.
2. Stop real-token compaction thrash.
3. Persist every served model route, then make model switches session-scoped.
4. Share context-reference preprocessing with the gateway.
5. Add bounded authenticated readiness to the existing public API server.

The first two are reliability work and should ship before expanding visible
operator surfaces. The ten existing parked cards remain external acceptance
work and are not dependencies for these local changes.
