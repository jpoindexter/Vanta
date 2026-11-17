# Vanta post-correction gap-closure report

**Date:** 2026-07-31 CEST

**Verdict:** **not integration-ready**

**Branch:** `codex/total-realignment-correction-20260730`

**Baseline / HEAD:** `a751cb17dcb768097798b4278882a64103527811`
**Worktree:** `/Users/jasonpoindexter/Documents/GitHub/docs/Vanta-total-realignment-correction-20260730`

Human-readable audit:
[`post-correction-gap-closure-audit-2026-07-31.html`](post-correction-gap-closure-audit-2026-07-31.html)

## 1. Executive verdict

The roadmap correction is structurally valid and the changed implementation
paths have strong local execution evidence. The combined worktree is **not
integration-ready** because:

1. correction-only documentation and later source implementation remain mixed;
2. universal effect mediation and full operational-spine migration are not done;
3. required external account, device, provider, packaged, and publication proofs
   were not executed;
4. runtime and website dependency advisories remain; and
5. the user prohibited the commits or history reconstruction required to create
   a durable correction checkpoint followed by a separate implementation base.

No commit, push, merge, tag, release, publication, or deployment occurred.

## 2. Constraint ledger

| Field | Controlling constraint | Result |
|---|---|---|
| Outcome | Close verified source, product, and roadmap gaps end to end. | Bounded local gaps implemented; residuals are explicit below. |
| Target | Isolated correction worktree from the active branch, not stale `origin/main`. | Branch and baseline preserved. |
| Must | Preserve all 1,319 active IDs; reconcile 14 active-only IDs and eight shared-card differences; add twelve realignment cards; install exact R0–R5 and nine-state contracts; preserve 28 outcomes as a catalog. | Validator-backed. |
| Must not | No original-checkout edits; no root Rust, protected factory, or `MANIFESTO.md` edits; no Git history or remote effects. | Verified. |
| Authority | Current user request, correction handoff, PM/ND routing, repository instructions. | Implementation is reported as post-correction work, not rewritten into the older correction record. |
| Done evidence | Full/targeted tests, type/build/smoke checks, hardened validator and mutations, security/privacy checks, exact diff and original-checkout comparison. | All locally available gates executed; external/protected-scope gaps remain. |

## 3. Before / after

| Area | Before | After in this worktree | What remains |
|---|---|---|---|
| Roadmap | Stale/shared snapshots dropped active IDs and misframed realignment work. | 1,319 active IDs preserved; twelve records added; 22 existing records changed through pinned permitted deltas; 1,331 unique; 1,297 existing records deep-equal. | `TRUST-02` and `UX-03` stay building. |
| Autonomy | R0–R5 wording drift and legacy runtime states could be read as the target contract. | Eight governing artifacts contain the exact R0–R5 definition; R0–R5 is reserved for autonomy; legacy behavior is labeled migration work. | E0–E5 remains reserved and non-operative. |
| Operational truth | Legacy five-state tasks and model prose could imply completion. | Typed WorkItem/Run/Approval/Receipt schemas; exact nine-state lifecycle and transition graph; verified/unverified settlement; accomplishment memory requires verified completion. | Every legacy store and host is not yet migrated. |
| Filesystem control | Ordinary tools could reach project secrets, audit state, hooks, and control files. | Project secrets/audit files denied; control-plane edits require fresh approval bound to exact bytes and SHA-256. Approval/effect transitions acquire a filesystem writer lock, persist one secret-free, hash-addressed journal envelope, then atomically and idempotently project JSONL views; failed projection remains pending and is replayed on the next transition or explicit reconciliation. Journal creation/lock failure rejects before projections; dead-owner locks are removed only after byte re-check. | Universal authoritative settlement and migration of every legacy host/store remain open. |
| Child processes | Shell, code, hooks, and model-selected MCP servers inherited broad credentials; MCP trust was requested only after launch/tool discovery; plugin-worker containment was lexical. | Safe child environment, default sandbox profiles, protected masks, hook network denial, real macOS sandbox coverage; dynamic and hook MCP launches receive only declared/safe environment variables; MCP trust is bound to the exact launch configuration and resolved before process/network start; plugin entries are canonicalized before spawn. | Alternate launchers and unsupported no-backend systems remain inventory work; explicit auto-mount/config authority and every external effect path are not proven equivalent. |
| Hook activation | Same-process hook/config activation was possible. | Process-lifetime hook snapshot; restart is required. | Does not establish the same invariant for every plugin/extension path. |
| Local auth | Desktop/local API auth and origin behavior were under-specified. | Random per-install token, fragment delivery, required server token, exact-origin and hostile navigation/window/read denial smoke. | Packaged/notarized release proof not run. |
| Google/Gmail | Scope, token storage, header, approval, and inbound-content boundaries were incomplete or ambiguous. | Per-service Gmail/Calendar/Drive scopes and stores; service-aware CLI/Desktop; CR/LF rejection; exact send approval; inbound content stripping and untrusted wrapping. | No real external Google account mutation receipt. |
| Completion/memory | Optional verifier, model prose, and separate best-effort JSONL appends could be mistaken for universal verified completion or durable settlement. | Tool-effect truth is explicit; turn completion is verified only when all WorkItems are verified; unverified accomplishment-shaped memories are dropped. The bounded TypeScript approval/effect path now has a durable settlement envelope, cross-process writer exclusion, and recoverable derived projections. | Universal mediation and durable cross-host reconciliation remain open. |
| Public claims | Docs overstated kernel universality, audit truncation, operative contracts, completion, messaging proof, comparison readiness, and accessibility defaults. | Current behavior, target, migration, historical snapshots, and release gates are separated. | Publication review is still required. |
| Validator | Happy-path checks could miss semantic drift, cycles, staged/committed source changes, or changed autonomy meaning. | Exact record hashes, canonical schema parse, duplicate/self/missing/cycle checks, 22 discrepancy mappings, pinned hashes, broad base-relative source guard, and mutation tests. | The correction-only guard correctly rejects this mixed worktree. |
| Dependencies | Dependency audit was not part of the correction evidence. | Website non-breaking remediation resolved eight of nine advisory classes and rebuilt successfully. | Runtime has 14 high findings with no safe automatic fix. Website retains one brace-expansion advisory class, reported by npm as 20 affected dependency paths; its offered fix is breaking. |

## 4. Section 17 disposition

### Corrected

- P0-A: public claims now distinguish standard-dispatch mediation from universal
  mediation as a release gate.
- P0-B: audit tail-truncation wording is conditional on log/key/anchor existence
  and protection.
- P0-C: autonomy and WorkItem language is labeled canonical target/migration
  where runtime migration is incomplete.
- P0-D: proposal-only Lab language is a target; current legacy factory and
  auto-research commit/push/merge behavior is named as a release blocker.
- P1-A: individual evidence/readback is separated from the optional post-turn
  verifier.
- P1-B: trust closure and reliability are named as core release work.
- P1-C: current public count is 22 registered adapters with only Telegram and
  ntfy accepted live.
- P1-D: accessibility commitments are separated from balanced/medium runtime
  defaults and remaining acceptance work.
- Exact autonomy definitions are aligned across eight governing artifacts.
- `Job` versus `Run` is resolved: Run is the canonical attempt; Job is a legacy
  projection.
- WorkItem/Run/Approval/Receipt schemas, legal transitions, retry/resume,
  terminality, and legacy projection boundaries are documented and implemented
  for the bounded slice.
- E0–E5 is explicitly reserved and non-operative; it cannot grant autonomy.
- External proof language is aligned to eleven canonical gates: one ready and
  ten pending. The public roadmap separately describes fourteen parked
  external-proof items rather than incorrectly calling all fourteen canonical
  gates.
- Every Section 17.5 validator requirement and mutation case is implemented.
- MCP denial now occurs before any server process or HTTP connection is started,
  and changing the command, arguments, environment declaration, auth declaration,
  URL, headers, or declared tool allowlist invalidates the persisted decision.
- Dynamic and hook-triggered MCP child processes no longer inherit undeclared
  parent secrets; the stdio transport has no implicit `process.env` fallback.
- Plugin-worker entry containment resolves symlinks before the child process is
  created.
- Approval/effect settlement now writes one secret-free authoritative journal
  envelope before its projections. Projection failure leaves the envelope
  pending; the next transition or explicit reconciliation repairs it
  idempotently. Journal creation failure rejects before any projection.
- A filesystem-backed writer lock serializes projection updates across
  processes, respects a live owner, times out fail-closed, and removes an
  abandoned lock only after re-reading identical owner bytes.

### Deferred with evidence

- Durable correction-only versus implementation separation. This needs commit or
  history authority the user explicitly withheld.
- Universal mediation across direct gateway, plugin, MCP, scheduler, worker,
  factory, self-repair, and alternate child-process paths.
- Protected Rust audit migration and protected factory behavior changes.
- Universal authoritative settlement and complete legacy host/store migration.
- Live Google/account/device/provider/payment/telephony/hosted/accessibility
  receipts.
- Dependency findings without a compatible upstream remediation.

### Reviewer finding rejected

The claim that Google still requests Gmail, Calendar, and Drive together is stale
against the live tree. Current code defines one scope and token store per
service, and focused/full tests pass. This is code-path evidence, not a live
external-account acceptance receipt.

## 5. Roadmap result

| Measure | Result |
|---|---:|
| Active snapshot records | 1,319 |
| First-pass records | 1,317 |
| Corrected unique records | 1,331 |
| Preserved active IDs | 1,319 |
| Added records | 12 |
| Changed existing records | 22 |
| Deep-equal existing records | 1,297 |
| Shipped | 1,281 |
| Parked | 38 |
| Building | 2 |
| Next | 4 |
| Horizon | 6 |
| Open | 12 |
| Implementation-ready open | 6 |
| Destination outcomes | 28, set-equal |
| Canonical schema | valid |
| Dependencies | resolved and acyclic |

Snapshot hashes:

```text
active snapshot     1f1334605d51c9fe5794bc53396655e987082013a73eef5e71f82b55ad50288c
stale snapshot      07969a59171ab52da78057702a498878b73c42fb709549a5ec7a28c3c24a72ae
first-pass roadmap  b15d6dcef3fe200a31f0a8ffc07fc9aad9df740118023da1ff5a27ae4658ff43
corrected roadmap   c98ca5b4662216b42111d98ceadfef01b6fe0b5e547794b134f11f4512e0dd1f
```

The 28 outcomes remain an acceptance catalog, not 28 simultaneous projects.
No roadmap card was promoted based only on code presence or adjacent tests.

## 6. Executed validation

| Command / path | Exit | Observed evidence | Does not establish |
|---|---:|---|---|
| `VANTA_KERNEL_URL=http://127.0.0.1:7791 npm test` (earlier correction pass) | 0 | 1,503 files; 13,883 passed; 3 intentional skips. The isolated authenticated kernel was then stopped and port 7791 verified closed. | Packaged, deployed, or real-provider behavior. |
| `npm test -- --maxWorkers=4` (current continuation) | 0 | 1,505 files; 13,892 passed; 3 intentional skips. The previously timing-sensitive background-response and hard-ceiling tests passed in this run. | Packaged, deployed, or real-provider behavior. |
| Focused Vitest changed-path suite | 0 | 24 files; 303 passed. | Unchanged paths or external accounts. |
| Focused MCP/plugin boundary suite | 0 | Nine files; 70 passed, including real pre-launch-denial, changed-config re-consent, undeclared-environment, trust-preview, and symlink-escape cases. | Every child launcher, explicit config authority, or external MCP server. |
| Approval/effect journal TDD and focused regression | 0 after expected reds | The initial journal cases failed 2/4, then passed 4/4. The writer-lock case then failed 1/5 before implementation and passed afterward. Permission/agent regression covered four files and 54 tests; the final focused pass covered four files and 15 tests. Cases execute fail-closed journal creation, pending replay, applied settlement, secret-free envelopes, and waiting on a live filesystem lock owner. | Universal legacy hosts or external provider settlement. |
| `npm run typecheck` | 0 | Runtime TypeScript valid after final edits. | Runtime behavior. |
| `npm run desktop:renderer:typecheck` | 0 | Renderer TypeScript valid after final edits. | Native packaging. |
| `npm run desktop:local-origin:smoke` | 0 | Production build; hostile read/navigation/window denied; trusted renderer passed. | Packaged/notarized Desktop; output explicitly says `packaged:false`. |
| `npm run build` in `vanta-website` | 0 | Docusaurus static production build passed after remediation. | Publication or live-site behavior. |
| Hardened realignment validator with `--allow-implementation` | 0 | Exact roadmap, schemas, cycles, autonomy, mappings, source inventory, and hashes passed. | Correction-only separation. |
| Validator mutation tests + build-order test | 0 | Eight tests passed: seven adversarial validator cases plus Git-authorization/build-order authority. | Every future mutation class. |
| Correction-only validator without override | 1, expected | Named 88 implementation paths and refused correction-only success. | It intentionally does not approve the mixed worktree. |
| `git diff --check` | 0 | No whitespace errors. | Semantic correctness. |
| Protected-path scan | 0 | No root `src/**`, `MANIFESTO.md`, or `vanta-ts/src/factory/**` diff. | Behavior in those untouched paths. |
| Gitleaks history + current changed/untracked scan | 0 | Earlier history scan covered 2,952 commits; the final 148-file, 4,016-KiB changed/untracked scan had zero findings. A whole-worktree directory scan found one generated-build false positive sourced from the non-secret `VANTA_SELF_IMPROVE=1` feature-flag example. | Ignored/generated artifacts can create scanner noise; pattern scanning is not proof that a secret cannot exist. |
| Semgrep security/secrets/command-injection | 0 | The prior current changed/untracked scan covered 102 files with 70 rules and zero findings. A final incremental scan of the two receipt-journal files ran 63 applicable rules with zero findings, zero errors, and 100% parsed lines. | The earlier changed scan had one partially parsed TypeScript file; the broad 3,654-file scan also had parser warnings and four existing HTTP-in-test findings, so this is not a universal clean-source claim. |
| `npm audit --omit=dev --json` in `vanta-ts` | 1 | 14 high findings, no critical; no safe automatic fix for the main no-fix chains. | A clean dependency gate. |
| `npm audit fix --omit=dev` then build/audit in website | 1 at residual audit | Eight advisory classes removed; one brace-expansion class remains and npm expands it to 20 affected Docusaurus paths; forced remedy is breaking. | A clean dependency gate. |
| `osv-scanner` on both lockfiles | 1 | Nine vulnerable package findings across the two lockfiles. | npm and OSV counts use different aggregation models; neither dependency gate is clean. |

The first full-suite run exposed two live-kernel authorization failures caused by
an unrelated sibling kernel on port 7788 and one hidden untracked Hermes source
fixture. The test preflight now requires an authorized assess call, the Hermes
test uses the committed pinned 262-story index, and the real live-kernel tests
were executed against an isolated authenticated kernel on port 7791 before the
full green run.

The first current-continuation run at the default eight workers had one timeout
in `src/ui/app-bg-response.test.tsx` while 13,888 other tests passed. That exact
file then passed three consecutive isolated runs, and the complete suite passed
at four workers, including the timing-sensitive test. This is evidence of
parallel-load sensitivity, not evidence that the initial failure never happened.

The first full-suite run after the receipt journal exposed three tests whose fake
`/x` project roots no longer satisfied the durable-root contract. Fixing those
fixtures produced a second run with all assertions green except one
`turn-loop-hard-ceiling` timeout caused by fsync on every derived projection.
The implementation was narrowed to fsync only the authoritative envelope; the
derived projections remain atomic and recoverable from that envelope. The
hard-ceiling test then passed in 5.26 seconds against its 20-second limit, and
the final complete suite passed. This retains both caught regressions instead of
erasing them from the evidence trail.

## 7. Claim ledger

### Executed

- Roadmap correction structure, counts, exact hashes, canonical schema, and
  dependency acyclicity.
- Full and focused automated behavior paths.
- MCP denial-before-launch, configuration-bound re-consent, scoped MCP child
  environment, and plugin-worker symlink containment.
- Approval/effect journal creation-before-projection, fail-closed journal
  creation, pending replay, idempotent applied settlement, and secret-free
  envelope behavior.
- Filesystem writer-lock exclusion, including waiting for a live owner before
  projection.
- Authenticated live-kernel allow/ask/block behavior.
- macOS sandbox behaviors covered by the real-path tests.
- Desktop local-origin production-build smoke.
- Docusaurus production build.
- Negative validator controls.
- Original-checkout comparison and protected-path scan.

### Code-path validated

- Per-service Google scope/token behavior.
- Gmail CR/LF rejection, approval envelope construction, and inbound untrusted
  wrapping.
- WorkItem/Run/Approval/Receipt persistence, filesystem-serialized journal
  reconciliation, and completion-memory filtering.
- Safe environment construction for shell, code, hooks, and the bounded MCP
  launch paths covered above.

These code-path claims do not establish real Google/provider effects, every
child launcher, every MCP/config authority path, or every host/store.

### Assumed or externally blocked

- Upstream compatibility for dependency fixes not currently offered without
  breaking changes.
- External credentials, accounts, devices, hosted infrastructure, notarization,
  market interviews, and publication authority.

No completion claim is made for those paths.

## 8. Repository diff and reset-point report

Final repository state:

- 127 tracked files differ from baseline;
- tracked diff is 3,903 insertions and 1,321 deletions;
- 20 untracked status entries include the implementation/correction artifacts and these
  two handoff reports;
- `git status --short` contains 147 file entries;
- `git diff --check` passed.

No files are staged.

The branch itself is the non-destructive reset handle:

```text
branch:   codex/total-realignment-correction-20260730
baseline: a751cb17dcb768097798b4278882a64103527811
```

No tag or commit was created because the controlling handoff explicitly forbids
commits, pushes, merges, and tags. Creating a durable Git reset point now would
contradict that instruction.

The original checkout remained:

```text
branch: agent/v0-9-7-desktop-demo-and-identity
HEAD:   a751cb17dcb768097798b4278882a64103527811
status: the same nine pre-existing Desktop/state/TTFT entries
```

`/Users/jasonpoindexter/Documents/GitHub/_active/Vanta` is not a Git repository;
it was not used as an implementation target.

## 9. Remaining integration gates

1. Review and authorize a correction-only checkpoint, then put implementation on
   a distinct durable base.
2. Finish universal effect inventory/mediation across direct gateway, plugin,
   MCP, scheduler, worker, factory, self-repair, and alternate launch paths.
3. Extend the existing durable journal persistence and filesystem writer
   exclusion through the remaining legacy host/store reconciliation paths.
4. Execute the required real external Google, provider, device, payment,
   telephony, hosted, accessibility, packaged, and notarized receipts.
5. Resolve runtime and website dependency advisories when compatible upstream
   versions exist.
6. Run publication, deployment, release, and integration gates only after
   explicit authorization.
