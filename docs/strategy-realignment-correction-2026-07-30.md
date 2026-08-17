# Vanta total-realignment correction — 2026-07-30

**Status:** Controlling correction record
**Authority:** `Vanta Codex Realignment Correction Handoff 2026-07-30.md`
**Source of work truth:** `roadmap.json`
**Human-readable audit:** `docs/strategy-realignment-audit-v2-2026-07-30.html`
**Historical first pass:** `docs/strategy-realignment-2026-07-30.md` and
`docs/strategy-realignment-audit-2026-07-30.html` are retained but superseded.

This is the durable cold-start and migration record. It is not a second work
database. Where the first pass, earlier packet documents, generated prose, or
historical statements conflict with this report, this report and the corrected
canonical files control.

## Reset point and mutation boundary

| Fact | Exact value |
|---|---|
| Original repository | Active checkout of this repository |
| Original active branch | `agent/v0-9-7-desktop-demo-and-identity` |
| Exact active commit | `a751cb17dcb768097798b4278882a64103527811` |
| Active upstream | `origin/agent/v0-9-7-desktop-demo-and-identity` |
| Active divergence | `0 ahead / 0 behind` |
| Correction branch | `codex/total-realignment-correction-20260730` |
| Isolated worktree | Separate local worktree for the correction branch |
| Integration method | Review this uncommitted worktree diff, then selectively commit or merge only with fresh authorization |

The exact reset point is the named active commit. No commit or tag was created
because this correction explicitly forbids Git-history mutation. No push,
merge, release, publication, or deployment was performed.

The original checkout had this pre-existing dirty state before the isolated
worktree was created:

```text
 D vanta-ts/desktop-app/dist/assets/index-CW0QGI6y.js
 D vanta-ts/desktop-app/dist/assets/web-B1E0c-Tx.js
 M vanta-ts/desktop-app/dist/index.html
 M vanta-ts/desktop-app/src/state.ts
 M vanta-ts/scripts/lib/ttft-performance.mjs
 M vanta-ts/scripts/lib/ttft-performance.node-test.mjs
 M vanta-ts/scripts/ttft-performance-harness.mjs
?? vanta-ts/desktop-app/dist/assets/index-CxRr5EBb.js
?? vanta-ts/desktop-app/dist/assets/web-DSbTWKMm.js
```

Those paths are outside this correction worktree's mutation set. The final
validation section records the end comparison.

## Product statement installed

> **Vanta is a full-capability, life-integrated, progressively autonomous
> personal AI operator for the general human experience. It can do the broad
> work expected of a Hermes/OpenClaw-class agent, while specializing in trusted
> continuity and responsibility transfer when human attention, memory, time,
> and executive function are finite. Neurodivergent and disability experience
> supplies curb-cut universal-design requirements without limiting the
> audience.**

The differentiator is trusted continuity under variable human capacity. The
durable wedge is responsibility transfer with bounded authority, inspectable
state, truthful receipts, recovery, and re-entry—not feature volume, an
ND-only market, or a company-of-agents identity.

## Three-way correction inventory

### Active branch: preserved authority

- All 1,319 active `roadmap.json` records and their ordering were the starting
  data.
- The active branch's nine additional shipped records, one additional parked
  record, six active-only open records, current desktop acceptance receipts,
  v0.9.8/reusable-run evidence, TUI continuity work, MSA and streaming-TTS
  evidence, and startup work were preserved.
- Current README release identity, 148-tool/151-command counts, desktop
  workbench facts, reusable runs, and bounded MSA/TTS statements were preserved.
- `MANIFESTO.md` and all product source were left unchanged.

### First pass: carried forward

- The broad trusted-operator product identity.
- The single canonical `roadmap.json` work store.
- The 28-outcome destination catalog.
- The twelve bounded realignment records and intended 2 Building / 4 Next
  ceilings.
- The historical-document labels, public-claim corrections, parking model,
  and source-blocker disclosure.
- The first Markdown report and HTML audit, retained as historical evidence.

### First pass: corrected or rejected

- Stale `origin/main` was rejected as a base; the exact active commit controls.
- The 1,305-card baseline and 18-card open inventory were replaced by the
  active 1,319-card baseline and 22-card inventory.
- The first pass's 1,317-card result was replaced by 1,331 unique cards:
  1,319 preserved plus twelve new.
- The five-stage autonomy model was replaced by the exact six-stage R0–R5
  contract, with R0–R5 reserved exclusively for autonomy.
- Any `captured/ready/doing/done` canonical lifecycle was replaced by the exact
  nine-state WorkItem lifecycle.
- Receipt dispositions were separated from lifecycle state.
- Public statements claiming universal mediation or universal verified
  completion were bounded to current executed evidence plus explicit gaps.
- Public accessibility, capacity, refusal, recovery, trusted-person,
  portable-export, Gmail-header, Google-scope, and self-repair boundaries were
  made explicit.
- The first pass's generated build-order prose remains a disclosed source
  blocker; it is not canonical strategy.

### File-level disposition

| Group | Disposition |
|---|---|
| `AGENTS.md`, `CLAUDE.md`, `SOUL.md`, `STRATEGY.md`, `DECISIONS.md` | Carried forward, then corrected to exact autonomy/lifecycle/current-proof authority |
| `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, current website docs | Carried forward and expanded to bound public claims and authority gaps |
| `docs/prd.md`, `docs/product-acceptance.md`, support/design docs | Rebased on active receipts; corrected contracts and acceptance boundaries added |
| `PARKED.md`, `docs/roadmap-retired-cards.md`, `ROADMAP.md` | Rebased from 18 stale open cards to 22 active open cards |
| `roadmap.json` | Rebuilt from the active snapshot; 1,319 records preserved, 22 intentionally parked, twelve added |
| First report and first audit | Preserved with an explicit superseded/historical warning |
| `HANDOFF.md` | Updated locally but ignored by repository policy; not part of the transferable diff |
| `MANIFESTO.md`, `src/**`, `vanta-ts/src/**`, factory source, user state | Not changed |

## Exact autonomy contract

R0–R5 is reserved exclusively for workflow/domain autonomy. E0–E5 is reserved
for a future consequence classifier but is not yet an implementation-usable
runtime scale and never grants autonomy.

- **R0 — Observe:** read, classify, and report; no mutation.
- **R1 — Recommend:** identify the outcome and propose one next action; no mutation.
- **R2 — Prepare:** create private, reversible drafts, tasks, notes, reminders, or isolated artifacts.
- **R3 — Confirm:** show the exact action preview and require fresh one-use authority.
- **R4 — Delegate:** run an allowlisted recurring workflow within explicit target, account, recipient, quota, budget, expiry, exclusions, cancellation, and review bounds.
- **R5 — Autonomous delegate:** in a proven bounded domain, initiate, chain, coordinate, communicate with permitted parties, monitor, reconcile, follow up, and recover without per-step approval.

No five-stage ladder, risk-tier reuse, or “Autopilot” alias is canonical.

## Exact WorkItem lifecycle

The complete ordered lifecycle is:

```text
draft → queued → running → waiting → needs human → stopped → failed → unverified → verified
```

`denied`, `expired`, `unknown`, and `compensated` are receipt/action
dispositions, not WorkItem lifecycle states. UI groupings such as inbox, today,
doing, waiting, or done are projections, never canonical storage values.

## Accessibility, capacity, and human authority

The governing contract now requires:

- concrete, literal, spatially explicit previews that are usable with
  aphantasia; no dependence on imagined scenes;
- no color-only meaning; high contrast, visible text/icon/state redundancy,
  and keyboard/screen-reader semantics;
- reduced-motion support; optional streaming and auto-scroll; stable reading
  position; summary first; a literal return-to-latest control;
- durable interruption state and an exact resume point;
- observable capacity across cognitive, attentional, sensory, social,
  emotional, physical, and time dimensions, including `unknown`;
- scoped, reviewable, expiring support state rather than diagnosis-based
  inference;
- literal controls for `do it`, `show me`, `snooze`, `skip`, and `off`;
- refusal at session, pattern, and global scope;
- quiet hours and interruption budgets, with no bargaining, shame, nagging,
  catch-up punishment, or coercive urgency;
- demand-avoidance/reactance-safe language and one reversible re-entry step;
- trusted-person support only with bilateral consent, visible scope, least
  privilege, revocation, expiry, no silent surveillance, and no authority
  escalation;
- portable data export for user data and history, never credentials, tokens,
  signing material, audit roots, device identity, grants, or restored
  authority; a new device requires fresh authentication and authorization.

## Roadmap before/after

### Snapshot totals and hashes

| Snapshot | Commit/source | SHA-256 | Total | Status summary |
|---|---|---|---:|---|
| Stale first-pass base | `origin/main` at `4911ae44` | `07969a59171ab52da78057702a498878b73c42fb709549a5ec7a28c3c24a72ae` | 1,305 | shipped 1,272; parked 15; next 2; horizon 16 |
| Verified active baseline | `a751cb17dcb768097798b4278882a64103527811` | `1f1334605d51c9fe5794bc53396655e987082013a73eef5e71f82b55ad50288c` | 1,319 | shipped 1,281; parked 16; next 1; horizon 21 |
| Superseded first-pass result | first worktree | `b15d6dcef3fe200a31f0a8ffc07fc9aad9df740118023da1ff5a27ae4658ff43` | 1,317 | shipped 1,272; parked 33; building 2; next 4; horizon 6 |
| Corrected result | this worktree | `c98ca5b4662216b42111d98ceadfef01b6fe0b5e547794b134f11f4512e0dd1f` | 1,331 | shipped 1,281; parked 38; building 2; next 4; horizon 6 |

Count equation:

```text
1,319 active records preserved + 12 new realignment records = 1,331
```

### Active baseline and corrected status counts

| Status | Active before | Corrected after | Difference |
|---|---:|---:|---:|
| shipped | 1,281 | 1,281 | 0 |
| parked | 16 | 38 | +22 |
| building | 0 | 2 | +2 |
| next | 1 | 4 | +3 |
| horizon | 21 | 6 | -15 |
| **Total** | **1,319** | **1,331** | **+12** |

The 22 open active records moved to parked. The twelve new records account for
all Building, Next, and remaining Horizon work.

### Track counts

| Track | Active before | Corrected after | Difference |
|---|---:|---:|---:|
| Cofounder engine | 35 | 35 | 0 |
| Desktop | 1 | 1 | 0 |
| Desktop App | 41 | 41 | 0 |
| Extensibility | 78 | 78 | 0 |
| Harness | 583 | 589 | +6 |
| Infrastructure | 12 | 12 | 0 |
| Memory | 2 | 2 | 0 |
| Messaging | 1 | 1 | 0 |
| Operator | 542 | 547 | +5 |
| Reach | 5 | 5 | 0 |
| Release | 2 | 2 | 0 |
| Solutioning | 14 | 15 | +1 |
| TUI | 3 | 3 | 0 |

### Tier counts

| Tier | Active before | Corrected after | Difference |
|---|---:|---:|---:|
| no tier | 49 | 49 | 0 |
| pebble | 486 | 486 | 0 |
| rock | 328 | 340 | +12 |
| sand | 456 | 456 | 0 |

## Packet-ID discrepancy and preservation resolution

The correction handoff calls 22 strings roadmap IDs: fourteen “missing active
IDs” and eight “shared IDs.” A literal whole-repository search and direct
`roadmap.json` parse found none of those 22 strings in the active commit or
stale snapshot. Adding them as new cards would contradict the same handoff's
required `1,319 + 12 = 1,331` total and would duplicate real active records.

The direct set comparison is authoritative: active has exactly fourteen
roadmap IDs absent from stale `origin/main`, and stale has no ID absent from
active:

```text
CONNECT-BOX-DRIVE-ROVO-PACKS
CONNECT-DROPBOX-ADAPTER
CONNECT-INTEGRATION-STATE-CATALOG
CONNECT-TRELLO-ADAPTER
TUI-DETERMINISTIC-TURN-SUMMARY
TUI-OUTPUT-HIERARCHY
TUI-RESTART-CONTINUITY
TUI-TASK-SCOPED-GO-AHEAD
VANTA-MSA-NATIVE-RUNTIME-PORT
VANTA-MSA-NVIDIA-RUNTIME-PROOF
VANTA-MSA-TS-INTEGRATION
VANTA-REUSABLE-RUN-LIBRARY
VANTA-STREAMING-TTS-FIRST-CLAUSE
VANTA-STREAMING-TTS-GATEWAY-AUDIO
```

All fourteen are present in the corrected result. The closest evidence-preserving
resolution of the packet labels is:

| Packet label | Active canonical record or receipt |
|---|---|
| `TUI-DETERMINISTIC-SESSION-ID-050` | `TUI-DETERMINISTIC-TURN-SUMMARY` and its active receipt |
| `TUI-OUTPUT-INTEGRITY-049` | `TUI-OUTPUT-HIERARCHY` |
| `TUI-RESTART-INTEGRITY-052` | `TUI-RESTART-CONTINUITY` |
| `TUI-TASK-SCOPED-LIVE-EVIDENCE-051` | `TUI-TASK-SCOPED-GO-AHEAD` and active product-acceptance receipt |
| `MS-A-REAL-WORK-OUTCOME-TS-025` | `VANTA-MSA-TS-INTEGRATION` |
| `CLI-REUSABLE-RUNS-053` | `VANTA-REUSABLE-RUN-LIBRARY` |
| `COMMS-LIVE-STREAMING-TTS-CLAUSE-2026-07-28` | `VANTA-STREAMING-TTS-FIRST-CLAUSE` |
| `DESKTOP-DEFAULT-MODEL-PREFERENCE-2026-07-28` | active `DESKTOP-MODEL-PICKER-UX`/desktop acceptance evidence |
| `DESKTOP-DEFAULT-IDENTITY-2026-07-28` | active desktop controller/model identity receipts |
| `DESKTOP-WORKBENCH-LAUNCH-2026-07-28` | active desktop workbench acceptance receipt |
| `STARTUP-BOUNDED-APP-PREWARM-2026-07-29` | active `QUICKSILVER-STARTUP-CRITICAL-PATH` update and commit `a751cb17` |
| `STARTUP-CRITICAL-PATH-2026-07-29` | active `QUICKSILVER-STARTUP-CRITICAL-PATH` record |
| `DESKTOP-DEMO-RESET-BAR-2026-07-28` | active desktop flow/reset acceptance evidence |
| `DESKTOP-TASK-AWARENESS-2026-07-28` | active task-checklist receipt on the relevant shipped TUI record |

The eight packet “shared ID” strings likewise are not literal roadmap IDs.
Their active execution/history evidence is preserved in the active-baseline
records and `docs/product-acceptance.md`; no fabricated aliases were added.
This discrepancy is reported, not silently normalized.

Those eight packet labels were:

```text
AM-BETA-033
AM-BETA-034
REWARD-METRICS-SAFETY-046
RELEASE-SMOKE-THRESHOLD-2026-07-27
MCP-FOUNDATION-024
TICKETS-ROADMAP-CANONICAL-036
TICKETS-ROADMAP-CANONICAL-040
CONTRACT-TEST-SCRIPTS-2026-07-28
```

## Existing-record field changes

Exactly 22 active records changed. Every one changed only `status`, `updated`,
`notes`, and `parkedReason`; all other fields remain byte-equivalent as parsed
JSON values.

| Existing active ID | Before → after | Destination / disposition |
|---|---|---|
| `VANTA-STREAMING-TTS-GATEWAY-AUDIO` | horizon → parked | UX-04 + LIFE-01 |
| `VANTA-MSA-NATIVE-RUNTIME-PORT` | horizon → parked | PACK-01 + LAB-01 |
| `BROWSER-WORKFLOW-ACTION-BOUNDARY` | horizon → parked | TRUST-03 + TRUST-05 |
| `QUICKSILVER-STARTUP-CRITICAL-PATH` | next → parked | UX-04 + EVAL-01 |
| `QUICKSILVER-DESKTOP-STREAM-PERF` | horizon → parked | UX-04 + EVAL-01 |
| `GATEWAY-DELIVERY-OBLIGATION-LEDGER` | horizon → parked | OP-04 + TRUST-04 |
| `EF-SUPPORT-DESKTOP-CONTROLS` | horizon → parked | UX-03 |
| `EF-SUPPORT-STATE-EXPIRY` | horizon → parked | UX-03 |
| `EF-SUPPORT-NONOVERREACH-EVALS` | horizon → parked | UX-03 + UX-04 + EVAL-01 |
| `REWARD-SEEKING-THREAT-MODEL` | horizon → parked | LAB-01 + EVAL-01 |
| `REWARD-PROCESS-INTEGRITY-BOUNDARY` | horizon → parked | TRUST-06 + EVAL-01 |
| `REWARD-SEEKING-CONTRASTIVE-DETECTOR` | horizon → parked | LAB-01 + EVAL-01 |
| `REWARD-SEEKING-BEHAVIORAL-SIGNAL-SUITE` | horizon → parked | LAB-01 + EVAL-01 |
| `REWARD-SEEKING-CALIBRATION-CONTROLS` | horizon → parked | LAB-01 + EVAL-01 |
| `REWARD-SEEKING-EVAL-AWARENESS-REDTEAM` | horizon → parked | LAB-01 + EVAL-01 |
| `REWARD-SEEKING-OVERSIGHT-GENERALIZATION` | horizon → parked | LAB-01 + EVAL-01 |
| `REWARD-SEEKING-MODEL-LEDGER` | horizon → parked | LAB-01 + EVAL-01 |
| `REWARD-SEEKING-RELEASE-GATE` | horizon → parked | LAB-01 + EVAL-01 |
| `CONNECT-INTEGRATION-STATE-CATALOG` | horizon → parked | TRUST-01 + LIFE-01 |
| `CONNECT-TRELLO-ADAPTER` | horizon → parked | TRUST-01 + TRUST-03 |
| `CONNECT-DROPBOX-ADAPTER` | horizon → parked | TRUST-01 + TRUST-03 |
| `CONNECT-BOX-DRIVE-ROVO-PACKS` | horizon → parked | PACK-01 + TRUST-01 |

The appended `notes` on each record name the exact realignment disposition and
destination. `parkedReason` is `strategy decision` except
`QUICKSILVER-DESKTOP-STREAM-PERF`, which is `optional proof`.

## Twelve new roadmap records

| ID | Status | Track | Dependency |
|---|---|---|---|
| `TRUST-02` | building | Harness | — |
| `UX-03` | building | Operator | — |
| `TRUST-04` | next | Harness | TRUST-02 |
| `TRUST-01` | next | Harness | TRUST-02 |
| `OP-01` | next | Operator | TRUST-04 |
| `GROW-01` | next | Solutioning | — |
| `TRUST-03` | horizon | Harness | TRUST-01, TRUST-02 |
| `TRUST-05` | horizon | Harness | TRUST-01, TRUST-02 |
| `TRUST-06` | horizon | Harness | TRUST-01, TRUST-02, TRUST-04 |
| `OP-03` | horizon | Operator | OP-01, TRUST-04 |
| `UX-04` | horizon | Operator | UX-03, TRUST-04 |
| `LIFE-02` | horizon | Operator | TRUST-05, OP-01, OP-03, UX-03 |

These are bounded records for documentation and roadmap reconciliation only.
No product-source implementation occurred.

## Twenty-eight destination outcomes

The set is:

```text
TRUST-01 TRUST-02 TRUST-03 TRUST-04 TRUST-05 TRUST-06
OP-01 OP-02 OP-03 OP-04 OP-05
UX-01 UX-02 UX-03 UX-04
LIFE-01 LIFE-02 LIFE-03 LIFE-04
GROW-01 GROW-02 GROW-03 GROW-04 GROW-05
PACK-01 LAB-01 EVAL-01 DOGFOOD-01
```

| Outcome | Representation | Activation rule |
|---|---|---|
| TRUST-01 | roadmap record | Next after TRUST-02 |
| TRUST-02 | roadmap record | Building urgent trust slice |
| TRUST-03 | roadmap record | After TRUST-01/02 |
| TRUST-04 | roadmap record | Next typed receipt/completion truth |
| TRUST-05 | roadmap record | After TRUST-01/02 |
| TRUST-06 | roadmap record | After TRUST-01/02/04 |
| OP-01 | roadmap record | Next after TRUST-04 |
| OP-02 | catalog acceptance | After OP-01; read-only projection first |
| OP-03 | roadmap record | After OP-01/TRUST-04 |
| OP-04 | catalog acceptance | One queue/trigger/worker contract |
| OP-05 | catalog acceptance | Folded into TRUST-04/OP-01 provenance |
| UX-01 | catalog acceptance | After OP-01/03 |
| UX-02 | catalog acceptance | Folded into UX-03 capture |
| UX-03 | roadmap record | Building safe continuity slice |
| UX-04 | roadmap record | After UX-03/TRUST-04 |
| LIFE-01 | catalog acceptance | TRUST-02/03/05 before effects |
| LIFE-02 | roadmap record | Quarantined read-only orientation |
| LIFE-03 | catalog acceptance | After LIFE-02/OP-04 |
| LIFE-04 | catalog acceptance | After exact capabilities/receipts |
| GROW-01 | roadmap record | Manual evidence lane |
| GROW-02 | catalog acceptance | Productize only after evidence |
| GROW-03 | catalog acceptance | Folded evidence-to-decision cycle |
| GROW-04 | catalog acceptance | One attributed pilot path |
| GROW-05 | catalog acceptance | Ethical relationship ledger |
| PACK-01 | catalog acceptance | Manifests/projections before extraction |
| LAB-01 | catalog acceptance | Folded into TRUST-06 isolation |
| EVAL-01 | attached acceptance | Every open slice carries exact proof |
| DOGFOOD-01 | attached evidence | TRUST-02, UX-03, and GROW-01 |

This catalog is a dependency and acceptance map, not 28 simultaneous projects.
Only the twelve records above consume the current open inventory.

## Trust blockers carried into acceptance

The current release boundary explicitly retains:

1. universal effect-path inventory and mediation;
2. secondary hooks and `runToolPost` behavior;
3. plugin and MCP effect paths;
4. direct/factory tool construction paths;
5. desktop, gateway, cron, webhook, and worker parity;
6. protected-path and credential-flow mediation;
7. authenticated local APIs and control planes;
8. one typed job/action/receipt model across hosts;
9. truthful `unverified` versus `verified` completion;
10. Gmail header CR/LF rejection before construction or send;
11. separate incremental Google scopes for Gmail, Calendar, and Drive;
12. untrusted-content quarantine for mail, web, documents, messages, and social
    input;
13. self-repair proposals that cannot adopt themselves, weaken evaluators,
    alter protected tests, or bypass review;
14. dependency-audit disposition with remediation or documented containment;
15. lint/quality gates with current executed receipts;
16. clean-machine, real-account, recovery, revocation, and rollback proof.

## Public claim/evidence reconciliation

| Prior public implication | Corrected current truth | Evidence retained | Gap retained |
|---|---|---|---|
| Every action is already kernel-gated | The standard dispatcher fails closed and submitted actions are assessed | current kernel/dispatcher tests and specific acceptance receipts | secondary hook/plugin/factory/credential/local-API paths need mediation |
| The kernel cannot be bypassed | Unavoidability is the target trust boundary | protected-path and standard-path evidence | TRUST-01/02/03/05 |
| Unattended work always completes verified | Reliability evaluation proves only exercised scenarios | tracked reliability results and exact receipts | universal typed completion and recovery need TRUST-04/OP-01 |
| Gmail/Google access is one broad connection | Each product requests incremental scope and effects require bounded authority | existing adapters and auth flows | CR/LF, scope-separation, revocation, and live-account proof remain |
| Self-improvement is safely closed | Proposal/adoption mechanisms exist | current review/adoption tests | evaluator integrity and production isolation remain TRUST-06 |
| A passing build proves production readiness | Builds prove compilation/link checks only | exact commands below | real accounts, clean-machine behavior, source trust gaps, and recovery remain |

Specific tool documentation may retain “always approval-gated” where it
describes the current registered implementation for that named tool. It is not
evidence that alternate, plugin, factory, or local-API paths are universally
mediated.

## Generated and ignored artifacts

- `roadmap.html` is ignored; it is regenerated locally from `roadmap.json` and
  is not transferable in the Git diff.
- `docs/vanta-build-order-agent-readable.md` is generated and currently
  untracked. It is left as a review artifact rather than silently added to
  canonical authority.
- `vanta-website/docs/roadmap.md` is tracked and regenerated from
  `roadmap.json`.
- `HANDOFF.md` is ignored by `.gitignore`; local edits do not travel with the
  patch. Durable facts are therefore in this tracked report.

The existing `scripts/build-order.mjs` emits stale five-pillar prose and a
commit/push instruction. Because changing generator source would violate this
handoff's no-product-source boundary, the generated file is explicitly
non-authoritative. The generator must be corrected in a later bounded source
slice before that view can become a trusted execution handoff.

## Unresolved source blockers and first bounded slices

No blocker below was implemented in this correction:

1. **TRUST-02:** inventory and close urgent hook, environment, audit-state, and
   local-authentication gaps; prove failure behavior.
2. **UX-03:** implement one safe capture → Today → prepared action → waiting →
   restart/re-entry path with the exact lifecycle and accessibility controls.
3. **TRUST-04:** establish one typed receipt and completion truth across every
   host; no `verified` state without executed evidence.
4. **TRUST-01:** enumerate and mediate every effect route, including secondary
   and factory paths.
5. **Generator correction:** remove stale five-pillar and commit/push prose from
   `scripts/build-order.mjs`, with focused generator tests.
6. **Website link/source cleanup:** fix any build-discovered broken internal
   links in a separately authorized source/documentation slice if not safely
   correctable here.

## Validation record

| Command | Exit | Salient output / boundary |
|---|---:|---|
| `node docs/strategy-realignment-validation-2026-07-30.mjs '<first-pass-roadmap.json>'` | 0 | 1,319 active IDs preserved; 12 additions; 22 intentional existing-record changes; 1,331 unique IDs; dependencies, 2/4/6 ceilings, exact contracts in eight governing files, 28-outcome equality, prior-decision bytes, and source guard passed |
| `node scripts/build-order.mjs docs/vanta-build-order-agent-readable.md` | 0 | 12 open cards; `total_cards: 1331`; output SHA-256 `5d7fb1e04c2f6bad5ce16f0739e05bfd8432e21e38ebc3dd4f4f20d92653dc4a` |
| `node vanta-website/scripts/gen-roadmap.mjs` | 0 | 2 Building, 4 Next, 20 recent, 14 external-proof, 6 Horizon across 2 tracks; output SHA-256 `dabcd0e48e58a1c62e0fe3ec43a6fe42a52e4c223efbf8218ca7e5fb53b7415f` |
| Native `buildRoadmap()` through the unchanged active TypeScript generator | 0 | zod schema parse plus ignored `roadmap.html`; SHA-256 `b56480830357137459b516319cafc39a1070ffcf924787e30e086b20faa10737`; 1,459,370 bytes |
| `./node_modules/.bin/vitest run src/roadmap/*.test.ts src/cli/roadmap-cmd.test.ts src/tools/roadmap-tools.test.ts` from the active source checkout | 0 | 17 files; 209 tests passed; source used is unchanged by this correction |
| Docusaurus production build using the active checkout's installed dependencies | 0 | optimized static site generated after the final public-doc edits; build/current-page/broken-link gate passed |
| `gitleaks detect --no-git --source <changed-files-tempdir> --redact --no-banner --exit-code 1` | 0 | 2.33 MB changed-file corpus; no leaks found |
| Quick Look render of `docs/strategy-realignment-audit-v2-2026-07-30.html` | 0 | 1,600 px preview generated and visually inspected; headings, contrast, metrics, callout, and responsive grid rendered correctly |
| Standalone audit structure assertion | 0 | 11 semantic sections; 4 captioned tables; working skip target; reduced-motion rule; no script |
| `git diff --check` plus `git diff --no-index --check` for every untracked artifact | 0 | tracked and untracked whitespace checks passed |
| Original-checkout exact state comparator | 0 | active branch, HEAD, upstream, 0/0 divergence, and all nine pre-existing dirty entries are byte-for-byte the expected status output |
| Active acceptance-table preservation assertion | 0 | all 25 active-branch Markdown table rows remain exact in `docs/product-acceptance.md` |

One initial native roadmap-HTML invocation exited `1` because top-level
`await` was used in a CommonJS eval. The corrected async-IIFE invocation exited
`0` and generated the artifact above. A whole-worktree gitleaks pass also found
one ignored generated-site example placeholder (`OPENAI_API_KEY=vanta`), not a
credential; the changed-file-only pass was clean.

The targeted current-public scan found no retained instances of the unsupported
absolute forms “every tool call still passes,” “finishes **verified** or stops,”
current npm “0 vulnerabilities,” “cannot bypass the kernel,” or “kernel gates
every action.” Retained uses of “unavoidable,” “universal,” “all,” or “every”
are explicitly a target/gap, a named standard-dispatch implementation, a
generated registry description, or labeled historical evidence.

## Finished repository diff inventory

The worktree has **53 review entries**: 47 tracked files modified
(2,032 insertions, 855 deletions) and six untracked review/generated artifacts
(2,672 lines, 118,197 bytes). If the six artifacts are later added, the combined
review footprint is 4,704 added lines and 855 removed lines.

Exact paths:

```text
AGENTS.md
CLAUDE.md
CONTRIBUTING.md
DECISIONS.md
PARKED.md
README.md
ROADMAP.md
SECURITY.md
SOUL.md
STRATEGY.md
docs/executive-dysfunction-brain-design.md
docs/executive-function-support.md
docs/living-operator.md
docs/prd.md
docs/product-acceptance.md
docs/roadmap-retired-cards.md
docs/strategy-realignment-2026-07-30.md
docs/strategy-realignment-audit-2026-07-30.html
docs/strategy-realignment-audit-v2-2026-07-30.html
docs/strategy-realignment-correction-2026-07-30.md
docs/strategy-realignment-validation-2026-07-30.mjs
docs/vanta-build-order-agent-readable.md
docs/vanta-next-evolution.md
roadmap.json
vanta-website/docs/acceptance.md
vanta-website/docs/agent-loop.md
vanta-website/docs/architecture.md
vanta-website/docs/autonomy.md
vanta-website/docs/comms-and-gateway.md
vanta-website/docs/comparison.mdx
vanta-website/docs/examples.md
vanta-website/docs/executive-function.md
vanta-website/docs/extending.md
vanta-website/docs/faq.md
vanta-website/docs/guides/automate-a-briefing.md
vanta-website/docs/guides/extend-vanta.md
vanta-website/docs/how-it-works.md
vanta-website/docs/integrations.md
vanta-website/docs/intro.md
vanta-website/docs/kernel.md
vanta-website/docs/knowledge-and-refs.md
vanta-website/docs/mcp.md
vanta-website/docs/operator-systems.md
vanta-website/docs/permissions-and-hooks.md
vanta-website/docs/plugins.md
vanta-website/docs/reference/api.md
vanta-website/docs/roadmap.md
vanta-website/docs/safety-model.md
vanta-website/docs/security.md
vanta-website/docs/self-improvement.md
vanta-website/docs/tools.md
vanta-website/docs/use-cases.mdx
vanta-website/docs/why-vanta.mdx
```

## Forbidden-mutation confirmation

This correction changes canonical documents, public documentation,
`roadmap.json`, and generated/review artifacts only. It does not change
`MANIFESTO.md`, product source, protected factory source, credentials, user
state, Git history, releases, deployments, or the original checkout's
pre-existing dirty files.
