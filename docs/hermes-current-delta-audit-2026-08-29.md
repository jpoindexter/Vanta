# Hermes current-delta audit — 2026-08-29

## Verdict

The latest Hermes comparison changes several Vanta acceptance contracts but does
not justify a wholesale port. Vanta should adopt the reliability patterns that
make long-running work truthful, preserve ownership, and fail atomically. Vanta
should not import Hermes source, visual identity, Python runtime, remote fleet,
bot/group-chat product, managed-update service, provider catalog, or cloud
architecture into the current beta path.

This is a source-and-history comparison, not implementation proof. No Hermes file
was copied into Vanta.

## Frozen evidence

- Previously reviewed Hermes revision:
  `1bbb6e5bce56e721ab685af4cd87df21bbff4d35`.
- Current Hermes `main` at audit time:
  `b1ff8722a53ee223485ac9804945acf07ef5c601`.
- Exact delta: 928 commits.
- License inspected at the current revision: MIT, Nous Research copyright.
- Vanta comparison stack head:
  `7fe12e14c77a3a3f6c8e969bbdf537538930be8e`.
- Vanta `origin/main` at audit time:
  `4911ae44bbb35beef4511ba298475ba5a82b7e1c`.

The review enumerated every commit subject in the exact range and then inspected
the current Desktop design contract, connection registry, remote lifecycle,
secret-storage policy, backend release gate, deadline implementation, and context
compressor. Commit subjects guided inspection; they are not treated as proof of
Vanta behavior.

## Adopt by strengthening existing cards

| Hermes pattern | Vanta authority | Decision |
| --- | --- | --- |
| Wall-clock deadlines that survive a blocked event loop; typed timeout ownership; suspect stateful backends; owned process-tree termination | `HARNESS-UNIFIED-DEADLINE-FAILURE-CONTRACT` | Strengthen the existing parked contract. Do not add per-call ad hoc timers. |
| Provider-reported usage anchors, byte-measured 413 recovery, compaction-boundary dynamic schema refresh, summary-route pinning, image aging, and cross-session guards | `HARNESS-DURABLE-PRECOMPACTION-CHECKPOINT` plus the shipped compaction stack | Strengthen checkpoint and replay criteria. Do not replace durable Vanta state with a generated summary. |
| Connection registry identity, quarantined malformed entries, stale-profile tombstones, transcript/cache ownership, warm-transcript proof, and resume revalidation | `DESKTOP-CONNECTION-PROJECT-LIFECYCLE` | Keep one canonical Vanta connection/project identity and fail closed on stale ownership. |
| Failure-atomic file saves, one streamed-text persistence owner, bounded caches, secure-store policy, update recovery, backend release compatibility, and power-resume revalidation | `DESKTOP-NATIVE-RESILIENCE-SHELL` and `QUICKSILVER-DESKTOP-STREAM-PERF` | Preserve data first; expose recovery truthfully; measure before activation. |
| One source per design concern, chat as home, durable destinations, short-task overlays, non-focus-stealing background work, project-owned cwd, and visible rollback | `DESKTOP-SEMANTIC-FOUNDATION-ACCESSIBILITY-REPAIR` and `DESKTOP-OPERATOR-DOSSIER-HIERARCHY` | Already reimplemented in the Vanta stack; retain Vanta semantics and visual identity. |
| Native file pickers and portable board export/import | Existing Vanta picker, portable-export, transcript-export, WorkItem, and operator-spine cards | No duplicate card. Strengthen the relevant existing acceptance fixture only when a real Vanta gap appears. |
| Atomic multi-skill patch/recovery and reduced prompt/schema payloads | Existing Vanta skill safety, prompt scoping, and tool-surface cards | Treat as implementation techniques and benchmark targets, not new product outcomes. |

## Defer or reject for the current beta

- Hermes Bot Mode, group chat, bot roster, and fleet rail are a separate product
  architecture. Vanta already has delegation, teams, WorkItems, approvals, and
  receipts; a parallel bot store would fragment operator truth.
- Remote SSH/cloud connection management, remote code kernels, and managed remote
  updates are not required for the local-first cold-operator proof.
- Provider/model catalog churn and a Node 24 installer floor are maintenance inputs,
  not user outcomes. Vanta changes its compatibility floor only from its own package
  and packaged-runtime evidence.
- Tips, pets, HUD cosmetics, broad localization, and optional questionnaire/setup
  generators do not displace the two-card beta queue. A future operator test may
  provide a specific re-entry signal.
- Consent-gated real-browser-profile copying remains a high-risk credential boundary.
  Vanta should prefer official OAuth/export paths and existing explicit browser
  authority rather than copying a browser profile because Hermes supports it.
- No Hermes branding, prose, tests, generated assets, source files, Git objects, or
  checkout belongs in the Vanta repository.

## Roadmap truth after reconciliation

- 1,341 canonical cards.
- 1,288 shipped.
- 2 Next: `DESKTOP-OPERATOR-DOSSIER-HIERARCHY`, then
  `DESKTOP-COLD-OPERATOR-RELEASE-PROOF`.
- 8 Horizon.
- 43 Parked.
- `GROW-01` remains Horizon and explicitly zero-cost.

`MCP-EXPLICIT-EMPTY-ALLOWLIST` is shipped from its executed mutation, real-stdio,
full-suite, typecheck, security, and architecture evidence.
`DESKTOP-SEMANTIC-FOUNDATION-ACCESSIBILITY-REPAIR` is shipped from its exact signed
package, VoiceOver, contrast, keyboard, reduced-motion, and 48-capture evidence.
`DESKTOP-OPERATOR-DOSSIER-HIERARCHY` remains Next because no unfamiliar person has
completed its comprehension criterion. The cold-operator card remains Next because
no qualifying external run exists.

## Re-entry

The next executable work is one exact packaged candidate plus a voluntary,
uncompensated unfamiliar-person run. Mechanical source, package, security, and
accessibility gates may be rerun locally, but they cannot substitute for observed
first-use comprehension.
