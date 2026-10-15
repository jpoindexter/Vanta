# Upstream agent and Desktop adoption — 2026-10-01

## Outcome and authority

Owner: Jason. Review the actual current Hermes and Vellum sources, add useful gaps to the canonical Vanta roadmap, and create a private, scoped Trello planning board. This is a planning/reconciliation change, not implementation, installation, product acceptance, publication or release.

The canonical planning branch is `codex/hermes-docs-roadmap-20260829` at base `ab5e8910f2d474ed3e84772bf2262893b9962b5e`. It already held uncommitted September planning. The nominal Desktop workbench is a partial snapshot, not the canonical application repository. Existing dirty planning and application work were preserved; a private external pre-edit binary diff, untracked archive and exact roadmap copy were retained.

- Before: 1,361 cards; 1,288 shipped, 4 Next, 8 Horizon, 61 Parked.
- After: 1,362 cards; 1,288 shipped, 4 Next, 8 Horizon, 62 Parked.
- One new defect card; 14 existing cards refined.
- All old IDs, statuses and dependencies preserved. All 1,288 shipped records unchanged.
- Four Next and twelve open slots remain unchanged; the new defect is parked for explicit triage, not silently added to active work.
- GROW-01, unfamiliar-person proof and paid work remain deferred. No paid services, workflows, outreach or recruitment are introduced.

## Source scope and confidence

Pinned source review, not an exhaustive certification of either repository:

- [Hermes source](https://github.com/NousResearch/hermes-agent/tree/040b6df2c40b0f4f88f51e4c2062eafc4d7463c5/) at `040b6df2c40b0f4f88f51e4c2062eafc4d7463c5`: credential rotation, deadlines, reply anchors, browser ownership, reconnect and composer queue. This consolidates the immediately preceding Hermes review.
- [Vellum source](https://github.com/vellum-ai/vellum-assistant/tree/cd99c7513bca15d3f02138e0960f3f3ed4048185/) at `cd99c7513bca15d3f02138e0960f3f3ed4048185`: scheduling, notifications, memory architecture and concurrent writes, credential service, memory inspector and consent controls.
- Vellum's [MIT license](https://github.com/vellum-ai/vellum-assistant/blob/cd99c7513bca15d3f02138e0960f3f3ed4048185/LICENSE) permits reuse with its copyright/license notice retained. Hermes is also MIT at the reviewed pin. Dependency licenses and source-specific notices still need review before an actual copy.
- No upstream checkout or implementation source was copied into Vanta. These are source-linked contracts and tests to adapt to Vanta's architecture.
- Code-path review does not establish production behavior, security completeness, macOS usability or paid-hosted service independence of an entire upstream product.

### What Vellum adds that matters

1. **Owned background work, not just a timer.** Its [scheduler](https://github.com/vellum-ai/vellum-assistant/blob/cd99c7513bca15d3f02138e0960f3f3ed4048185/assistant/src/schedule/scheduler.ts) associates child work and wakes with a run ID, waits for owned continuations, and cancels only the affected run. Adopt the ownership/settlement model and tests; retain Vanta's independent authority gate and uncertainty receipts.
2. **Attention decisions separated from delivery.** The [decision engine](https://github.com/vellum-ai/vellum-assistant/blob/cd99c7513bca15d3f02138e0960f3f3ed4048185/assistant/src/notifications/decision-engine.ts) has a bounded model decision and deterministic fallback. Vanta must enforce quiet hours, refusal, deduplication and interruption budget independently; urgency must not bypass these gates or fan out to accounts without authority.
3. **Memory made inspectable.** The [memory inspector](https://github.com/vellum-ai/vellum-assistant/blob/cd99c7513bca15d3f02138e0960f3f3ed4048185/clients/web/src/domains/chat/inspector/components/tabs/memory-tab.tsx) distinguishes retrieval states and exposes selected/injected context. Adopt a compact contextual explanation, not a mandatory graph or complex settings maze. Verification, correction, challenge and opt-out are explicit Vanta acceptance requirements.
4. **Origin-aware learning and imports.** The [memory architecture](https://github.com/vellum-ai/vellum-assistant/blob/cd99c7513bca15d3f02138e0960f3f3ed4048185/assistant/docs/architecture/memory.md) separates capture, consolidation, imports and retrieval, including observation dates and source provenance. Adopt bounded retrieval and reviewed imports; do not import a new memory database or automatic personality profiling.
5. **Credential execution boundary.** The [credential service design](https://github.com/vellum-ai/vellum-assistant/blob/cd99c7513bca15d3f02138e0960f3f3ed4048185/assistant/docs/credential-execution-service.md) separates approved execution from normal tool access. Adapt opaque execution handles and negative tests, not the hosted platform or assistant-wide grants. The [credential backend](https://github.com/vellum-ai/vellum-assistant/blob/cd99c7513bca15d3f02138e0960f3f3ed4048185/assistant/src/security/ces-rpc-credential-backend.ts) also exposes privileged credential get/set RPC: this is not evidence that every runtime path is incapable of reading credentials.
6. **Separate privacy choices.** [Consent controls](https://github.com/vellum-ai/vellum-assistant/blob/cd99c7513bca15d3f02138e0960f3f3ed4048185/clients/web/src/domains/onboarding/components/consent-controls.tsx) distinguish diagnostics/analytics switches from agreements and support policy-change notes. Vanta keeps optional sharing off unless explicitly chosen and preserves choices across restart.

### Patterns specifically NOT to copy

- The [latest Vellum commit](https://github.com/vellum-ai/vellum-assistant/commit/cd99c7513bca15d3f02138e0960f3f3ed4048185) corrects documentation that had overstated local OS sandboxing. Software path restrictions and sanitized `bash -c` are not an OS security boundary. Do not adopt the old claim.
- The [memory buffer implementation](https://github.com/vellum-ai/vellum-assistant/blob/cd99c7513bca15d3f02138e0960f3f3ed4048185/assistant/src/plugins/defaults/memory/buffer-file.ts) documents residual append-loss windows after its 500 ms late-writer drain, and unrecovered bytes after repeated I/O failure. Adopt the failure cases and observability, not a claim of lossless concurrency. Vanta's existing local-state card requires a shared cross-process exclusion or transactional protocol.
- Likewise, do not silently copy a personal browser profile, restore expired approval authority, add paid hosted infrastructure, replay uncertain messages, or replace Vanta's runtime with a competitor's stack.

## New defect: provider refresh atomicity

`PROVIDER-OAUTH-REFRESH-ATOMICITY` is a new bounded defect slice, not a duplicate of shipped credential-pool support. The preceding synthetic probe at installed Vanta head `12bc974c0383157abcd943f0c129e1fe9c63ef89` observed two refresh requests, one write, one fulfilled caller and one rejected caller when a losing 401 arrived before the winning write. No live credential was used. The earlier focused provider/context/browser baseline was 53 passing tests; it was not rerun as a product acceptance gate for this documentation turn.

Relevant installed source: `vanta-ts/src/providers/codex-auth.ts` and `codex-auth-file.ts`. Candidate upstream pattern: [Hermes credential pool](https://github.com/NousResearch/hermes-agent/blob/040b6df2c40b0f4f88f51e4c2062eafc4d7463c5/agent/credential_pool.py), which holds shared-store ownership across reread, refresh and persistence, and handles external-writer drift separately.

Done requires a two-process regression, atomic account-scoped writes, crash/stale-lock/disk-full/timeout/external-CLI tests and the actual installed provider path using synthetic credentials. A real login needs separate authority. The defect remains unfixed in this turn.

## Existing-card adoption map

The complete added acceptance clauses are in canonical JSON. This map is provenance, not a second status database.

| Canonical owner | Retained status | Pinned source |
| --- | --- | --- |
| `HARNESS-UNIFIED-DEADLINE-FAILURE-CONTRACT` | parked | [source 1](https://github.com/NousResearch/hermes-agent/blob/040b6df2c40b0f4f88f51e4c2062eafc4d7463c5/agent/deadline.py), [source 2](https://github.com/vellum-ai/vellum-assistant/blob/cd99c7513bca15d3f02138e0960f3f3ed4048185/assistant/src/schedule/scheduler.ts) |
| `HARNESS-DURABLE-PRECOMPACTION-CHECKPOINT` | parked | [source 1](https://github.com/NousResearch/hermes-agent/blob/040b6df2c40b0f4f88f51e4c2062eafc4d7463c5/agent/conversation_compression_reply_anchor.py) |
| `SANDBOX-EGRESS-CREDENTIAL-BROKER` | parked | [source 1](https://github.com/vellum-ai/vellum-assistant/blob/cd99c7513bca15d3f02138e0960f3f3ed4048185/assistant/docs/credential-execution-service.md), [source 2](https://github.com/vellum-ai/vellum-assistant/blob/cd99c7513bca15d3f02138e0960f3f3ed4048185/assistant/src/__tests__/credential-security-invariants.test.ts) |
| `LEARNING-SKILL-MEMORY-ROUTING` | parked | [source 1](https://github.com/vellum-ai/vellum-assistant/blob/cd99c7513bca15d3f02138e0960f3f3ed4048185/assistant/docs/architecture/memory.md) |
| `SCHEDULE-CONTINUITY-CHANGE-SUPPRESSION` | parked | [source 1](https://github.com/vellum-ai/vellum-assistant/blob/cd99c7513bca15d3f02138e0960f3f3ed4048185/assistant/src/schedule/scheduler.ts), [source 2](https://github.com/vellum-ai/vellum-assistant/blob/cd99c7513bca15d3f02138e0960f3f3ed4048185/assistant/docs/architecture/scheduling.md) |
| `GATEWAY-DELIVERY-OBLIGATION-LEDGER` | parked | [source 1](https://github.com/vellum-ai/vellum-assistant/blob/cd99c7513bca15d3f02138e0960f3f3ed4048185/assistant/docs/architecture/scheduling.md) |
| `OP-03` | horizon | [source 1](https://github.com/vellum-ai/vellum-assistant/blob/cd99c7513bca15d3f02138e0960f3f3ed4048185/assistant/src/notifications/decision-engine.ts) |
| `DESKTOP-NATIVE-RESILIENCE-SHELL` | parked | [source 1](https://github.com/NousResearch/hermes-agent/blob/040b6df2c40b0f4f88f51e4c2062eafc4d7463c5/apps/desktop/src/store/composer-queue.ts) |
| `DESKTOP-CONNECTION-PROJECT-LIFECYCLE` | parked | [source 1](https://github.com/NousResearch/hermes-agent/blob/040b6df2c40b0f4f88f51e4c2062eafc4d7463c5/apps/desktop/src/store/gateway-reconnect.ts) |
| `UX-04` | horizon | [source 1](https://github.com/vellum-ai/vellum-assistant/blob/cd99c7513bca15d3f02138e0960f3f3ed4048185/clients/web/src/domains/chat/inspector/components/tabs/memory-tab.tsx), [source 2](https://github.com/vellum-ai/vellum-assistant/blob/cd99c7513bca15d3f02138e0960f3f3ed4048185/clients/web/src/domains/onboarding/components/consent-controls.tsx) |
| `BROWSER-AUTHENTICATED-WORKSPACE` | horizon | [source 1](https://github.com/NousResearch/hermes-agent/blob/040b6df2c40b0f4f88f51e4c2062eafc4d7463c5/tools/browser_supervisor.py), [source 2](https://github.com/NousResearch/hermes-agent/blob/040b6df2c40b0f4f88f51e4c2062eafc4d7463c5/tools/browser_tool_real_profile.py) |
| `DESKTOP-OPERATOR-DOSSIER-HIERARCHY` | next | [source 1](https://github.com/NousResearch/hermes-agent/blob/040b6df2c40b0f4f88f51e4c2062eafc4d7463c5/apps/desktop/src/store/composer-queue.ts), [source 2](https://github.com/vellum-ai/vellum-assistant/blob/cd99c7513bca15d3f02138e0960f3f3ed4048185/clients/web/src/domains/chat/inspector/components/tabs/memory-tab.tsx) |
| `LOCAL-STATE-ATOMIC-RECOVERY-BOUNDARY` | next | [source 1](https://github.com/vellum-ai/vellum-assistant/blob/cd99c7513bca15d3f02138e0960f3f3ed4048185/assistant/src/plugins/defaults/memory/buffer-file.ts), [source 2](https://github.com/vellum-ai/vellum-assistant/blob/cd99c7513bca15d3f02138e0960f3f3ed4048185/assistant/docs/architecture/memory.md) |
| `SESSION-RESUME-PERSISTENCE-IDEMPOTENCE` | parked | [source 1](https://github.com/NousResearch/hermes-agent/blob/040b6df2c40b0f4f88f51e4c2062eafc4d7463c5/apps/desktop/src/store/composer-queue.ts) |

The existing browser implementation already injects authorized cookies; this review does not reintroduce the obsolete claim that authentication injection is missing. The gap is durable browser ownership, recovery and user-visible scope across interactions.

The existing conversation-first Desktop work should be integrated and proved, not thrown away for a third shell. Its prior synthetic-provider packaged proof does not establish the installed app or live-account flow. Revalidate exact source, dependency/security branch compatibility and packaged candidate before integration; do not blindly merge an older security branch's package manifests.

## Dependency-ordered execution plan

**Now:** retain the four current Next commitments. Work in one bounded trust lane and one Desktop lane, not eighteen simultaneous projects. Reconcile existing dirty Desktop work with the actual feature stack before implementation edits. The first Desktop slice is New chat → send → stream → stop → switch → resume with real persisted drafts and a visible editable queue.

**Next:** after the shared local-state boundary is implemented, close the OAuth race. In dependency order, add browser-session ownership, common deadlines, reconnect coordination and restart-safe queue settlement. Reuse current Vanta stores and capability contracts.

**Then:** make scheduled work and delivery settle independently and truthfully; add the minimal memory provenance/correction UI and approval-gated learning/import refinements. These remain parked/Horizon until selected, not implied sprint commitments.

**Later:** unfamiliar-person proof when the owner is ready. No one-person test substitutes for broad market proof. No paid growth, optional cloud/fleet architecture, new vector service, or replacement engine is required.

**Re-entry:** refresh Git/worktrees and the exact card; retain its smallest failing regression or packaged-path proof before modifying implementation. Do not disturb other dirty work. Source reuse needs a pinned diff, license/NOTICE record, dependency audit and behavior tests.

**Observable Done for implementation:** each canonical acceptance path executes against the exact candidate, including failure, cancellation, restart and denied authority; retain redacted evidence. Roadmap edits alone never meet it.

## Trello projection

Private board: [https://trello.com/b/dDzFD7VZ/vanta-agent-desktop-recovery](https://trello.com/b/dDzFD7VZ/vanta-agent-desktop-recovery).

Five lists: Read first; Next (4); Later (3 scoped Horizon cards); Parked (10); Deferred human proof (1). Eighteen unique canonical task IDs plus one guide card. No card marked complete. The remaining historical backlog stays in canonical JSON, not duplicated across Trello.

`upstream-adoption-trello-2026-10-01.json` records exact card URLs and IDs. This is a **manual** projection, not automatic two-way synchronization. Update canonical JSON first, regenerate local/public projections, then refresh the matching Trello [ID] card. Do not treat a board move as proof of shipping.

The connector enforces 2,048-character descriptions. Longer creates were rejected before creation and retried with concise acceptance additions and a reference to the full canonical contract. Final readback checks counts, unique IDs and preserved status labels; pagination is exhausted.

## Validation boundary

Executed planning checks are listed below; no full application, packaged app, live browser account, human beta or release test was run in this turn. No product-source edits, commit, push, tag, install, merge or release.

- Canonical schema parse and lossless semantic round-trip: 1,362 records.
- Preserved-ID/status/dependency comparison against the private exact pre-edit JSON: 1,361 retained, 14 refined, one added; 1,288 shipped records byte-equivalent as parsed records.
- Duplicate, missing-dependency, self-dependency and cycle checks: no errors.
- Build-order/current-projection tests: 7 passed, 0 failed.
- ROADMAP.md, agent-readable build order, website roadmap and HTML board regenerated using existing generators.
- Trello readback: 19 total cards, 18 unique canonical IDs, none complete; five lists, no further page.
- Final projection/secret/whitespace checks: see final gate record appended below.

The first schema round-trip check compared JSON property ordering and failed despite a successful schema parse. It was corrected to deep structural equality and passed without changing roadmap data.

### Final planning gate record

| Gate / executed command | Exit | Observed result |
| --- | --- | --- |
| `node scripts/roadmap-current-projection.mjs` | 0 | Current Markdown section regenerated; historical narrative preserved |
| `node scripts/build-order.mjs` | 0 | 12 open cards |
| `node vanta-website/scripts/gen-roadmap.mjs` | 0 | Canonical website projection regenerated locally; not deployed |
| `node scripts/roadmap-current-projection.mjs --check` | 0 | Exact match |
| `node --test scripts/build-order.test.mjs scripts/roadmap-current-projection.test.mjs` | 0 | 7 passed, 0 failed |
| Existing `tsx` runner: `RoadmapSchema.parse` plus `deepStrictEqual` | 0 | 1,362 records; lossless semantic round-trip |
| Existing `tsx` runner: `renderRoadmap` and `buildOrderDocument` exact output comparisons | 0 | HTML and build-order match canonical JSON |
| Node assertions against private pre-edit JSON | 0 | All old IDs, statuses and dependencies retained; 14 refinements, one addition; shipped records unchanged; graph valid |
| Node assertions against pre-edit binary diff and untracked tar archive | 0 | Unrelated tracked diffs and six pre-existing untracked files unchanged |
| Trello card readback and canonical-ID assertions | pass | Five lists, 19 cards, 18 unique task IDs, no completed cards; pagination exhausted |
| Trello private-board filtered read | pass | Created board returned under private visibility |
| `git diff --check` | 0 | No whitespace errors |
| Scoped `git diff` piped to `gitleaks stdin --redact --no-banner` | 0 | No findings in the four changed tracked roadmap projections, including inherited diff content |
| `gitleaks dir docs/upstream-agent-desktop-adoption-2026-10-01.md --redact --no-banner` | 0 | No findings |
| `gitleaks dir docs/upstream-adoption-trello-2026-10-01.json --redact --no-banner` | 0 | No findings |

The installed dependency runner was reused without installing packages. The target schema was compared to the installed schema before reuse; a subsequent check imported the target schema and renderer directly. No credential was read. The HTML board is an ignored generated artifact, regenerated locally rather than added to Git. This turn changes four already-dirty tracked planning/projection files, adds this audit and the Trello manifest, and regenerates that ignored HTML file. Repository-wide diff totals include inherited September work and must not be attributed to this turn.

Verdict: the scoped roadmap and Trello reconciliation is validated locally and saved; product fixes remain unimplemented by this turn. The repository intentionally remains dirty with the owner's preserved work. No GitHub publication or repository-wide security clearance is claimed.
