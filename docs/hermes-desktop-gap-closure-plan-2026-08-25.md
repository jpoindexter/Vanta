# Vanta Hermes/Desktop gap-closure plan — 2026-08-25

> **Controlling refresh — 2026-08-29:** Hermes `main` advanced from the reviewed
> `1bbb6e5b` snapshot to `b1ff8722`, a 928-commit delta. The fresh comparison is
> recorded in `docs/hermes-current-delta-audit-2026-08-29.md`. It strengthens
> existing parked contracts but does not add a fifth active card or authorize a
> Hermes source import, remote fleet, bot/group-chat product, paid service, or
> release. The evidence-backed MCP and semantic-foundation cards are now shipped;
> operator comprehension and cold-operator proof remain Next.

## Decision

Adopt every current Hermes pattern that strengthens Vanta's operator experience,
continuity, reliability, or testability without replacing Vanta's TypeScript
architecture, kernel-gated effect boundary, nine-state WorkItem lifecycle, receipt
truth, local-first posture, or current zero-cost user-testing priority.

This is a pattern-and-contract port, not a visual clone or a wholesale source port.
Hermes is MIT-licensed at the reviewed revision. If a later implementation copies a
substantial source portion rather than reimplementing a pattern, that change must
retain the applicable copyright and MIT notice and identify the exact upstream file
and revision in the commit and PR.

## Evidence snapshot

- Vanta source: `4cb3dae364988bf09cbea91871b8cf22a2ddc3fa`
- Vanta comparison base: `origin/main` at
  `4911ae44bbb35beef4511ba298475ba5a82b7e1c`
- Hermes source: `NousResearch/hermes-agent` at
  `1bbb6e5bce56e721ab685af4cd87df21bbff4d35` (current `main` on
  2026-08-25; latest stable tag observed: `v2026.8.19`)
- Hermes Desktop evidence read: `apps/desktop/README.md`, `DESIGN.md`,
  `AGENTS.md`, Electron ownership/connection/runtime modules, and its unit and
  Playwright inventory.
- Vanta Desktop evidence executed in the preceding audit: 42 current visual-route
  captures and the packaged Electron interaction smoke passed; the opt-in
  accessibility proof failed on the approval screen with 10 serious contrast
  findings. Six old Connect screenshots were no longer exercised.
- This plan does not claim any new product behavior. It changes roadmap truth only.

## Product constraints

- The operator's outcome and next decision outrank runtime telemetry.
- Chat remains the home surface; durable work gets stable destinations; short tasks
  use overlays; background activity never steals focus.
- One project owns its working directory. Sessions, repositories, and worktrees are
  subordinate context, not competing folder authorities.
- One source per design concern: semantic tokens and shared primitives over literals
  and local overrides.
- Direct manipulation may paint immediately, but persistence failure must roll back
  visibly and preserve truth.
- Empty capability configuration is not equivalent to missing configuration.
- Provider, tool, and host claims must be derived from the effective callable
  registry after policy.
- No paid research, outreach, hosted CI, release, deployment, or cloud migration is
  authorized by this plan.

## Roadmap reconciliation

The source-of-truth roadmap moves from 1,331 to 1,341 cards while preserving the
capacity contract:

| State | Before | After | Change |
|---|---:|---:|---:|
| Shipped | 1,286 | 1,286 | 0 |
| Next | 1 | 4 | +3 |
| Horizon | 7 | 8 | +1 |
| Parked | 37 | 43 | +6 |
| Open | 8 | 12 | +4 |

No existing shipped card is demoted. New correction cards exist because an executed
current-path check or current-head comparison proved a narrower contract was not
actually covered by the older broad completion claim.

### Active dependency queue

1. `MCP-EXPLICIT-EMPTY-ALLOWLIST` — correct the capability-isolation invariant.
2. `DESKTOP-SEMANTIC-FOUNDATION-ACCESSIBILITY-REPAIR` — repair the executed
   accessibility failure and establish one visual authority.
3. `DESKTOP-OPERATOR-DOSSIER-HIERARCHY` — rebuild hierarchy on the corrected
   foundation.
4. `DESKTOP-COLD-OPERATOR-RELEASE-PROOF` — run the first voluntary, zero-cost,
   uncoached operator proof on the exact packaged candidate.

`CAPABILITY-GROUNDED-SYSTEM-PROMPT` is the first Horizon follow-up after the MCP
correction. Its essential no-false-tool regression is also required by the MCP card,
so the cold proof is not exposed to the confirmed explicit-empty bug.

### Existing cards strengthened rather than duplicated

- `QUICKSILVER-STARTUP-CRITICAL-PATH`: add candidate execution/health validation and
  distinct install, connect, repair, offline, and boot-failure states.
- `QUICKSILVER-DESKTOP-STREAM-PERF`: add durable event IDs, reconnect replay,
  deduplication, interim-message fidelity, and restart byte identity.
- `UX-04`: add non-focus-stealing background continuity, durable unread boundaries,
  queue/draft/scroll restoration, direct-manipulation rollback, and Cmd/Ctrl+L.
- `OP-03`: remains the one deterministic attention projection; do not add a second
  notification truth.
- `TRUST-03` and `TRUST-04`: remain the action-envelope and settlement authorities;
  do not introduce a Hermes-shaped parallel receipt model.
- `MERCURY-CROSS-PLATFORM-SERVICE`,
  `DESKTOP-RELEASE-CANDIDATE-PROVENANCE`, and
  `CONNECT-INTEGRATION-STATE-CATALOG` already own cross-platform lifecycle,
  release binding, and truthful integration states.

### Compatible patterns captured as parked cards

- `HARNESS-UNIFIED-DEADLINE-FAILURE-CONTRACT`
- `HARNESS-DURABLE-PRECOMPACTION-CHECKPOINT`
- `WEB-POLICY-SAFE-RESULT-CACHE`
- `GLOBAL-PAUSE-NEW-WORK-SENTINEL`
- `DESKTOP-CONNECTION-PROJECT-LIFECYCLE`
- `DESKTOP-NATIVE-RESILIENCE-SHELL`

These are retained with falsifiable Done criteria and explicit re-entry triggers, but
they do not displace the current user-testing path.

## Implementation plan

### Phase 0 — freeze evidence and protect boundaries

1. Refresh `origin/main`, the active product branch, worktrees, and dirty state.
2. Create one isolated branch per active card from the latest validated stack; never
   rewrite published branches.
3. Record the exact Vanta and Hermes revisions, changed-file manifest, protected-path
   hash set, and no-Hermes/no-Nightcode/no-local-state scan before edits.
4. Keep GitHub Actions disabled. Use local, source-controlled tests only.

Done: the implementation branch is isolated, every inherited change is accounted for,
and protected paths plus the installed checkout are byte-stable.

### Phase 1 — close the MCP explicit-empty capability hole

Card: `MCP-EXPLICIT-EMPTY-ALLOWLIST`.

1. Define three states at the config boundary: absent, explicit empty, and explicit
   non-empty.
2. Carry that type without truthiness shortcuts through config merge, mount,
   reconnect, tool search, delegation, Desktop, and TUI.
3. Build the effective registry after allow and deny policy; deny always wins.
4. Add mutation/property tests that try to reintroduce `[] -> all` at each seam.
5. Assert both the stable prompt and user-visible capability surfaces contain no
   unavailable tool names.

Local gate: focused MCP/config/delegation/prompt tests, TypeScript typechecks, full
TypeScript suite, architecture/size checks, secret scan, protected-path scan, and
`git diff --check`.

Done: an explicit-empty server exposes and advertises zero tools on CLI, TUI,
Desktop, reconnect, and delegated paths.

### Phase 2 — establish the Desktop semantic and accessibility foundation

Card: `DESKTOP-SEMANTIC-FOUNDATION-ACCESSIBILITY-REPAIR`.

1. Inventory all token roots, literal colors, local control overrides, text below
   12px, controls below 36px, focus treatments, and screenshot routes.
2. Choose one semantic token authority for surface, text, border, accent, danger,
   success, warning, focus, spacing, type, elevation, and motion.
3. Consolidate Button, field, search, loader, error, and confirmation primitives.
4. Fix the approval screen first, then every instance of the same token/primitive
   defect. Do not recolor isolated screenshots.
5. Register all supported routes in one visual matrix; remove or deliberately archive
   stale baselines, and fail the test when a route lacks a current capture.

Local gate: unit tests for primitives and state semantics; renderer typecheck; source
visual proof; packaged accessibility proof; VoiceOver task; keyboard-only approval;
contrast and color-vision checks; reduced motion; narrow resize; production package;
and orphan-baseline detection.

Done: zero serious/critical findings on all consequential screens and complete current
route evidence on the exact packaged app.

### Phase 3 — build the Vanta Operator Dossier

Card: `DESKTOP-OPERATOR-DOSSIER-HIERARCHY`.

1. Keep Chat/Work as home and reduce the rail to stable destinations.
2. Make the current outcome, next action, and approval/blocked state the first visual
   read. Move engine, token, kernel, and model detail into one progressive disclosure.
3. Separate durable tasks/history from transient activity and tool chatter.
4. Keep the compact provider-scoped model picker; provider change stays in model
   setup, not the quick picker.
5. Make queued messages visible, editable, reorderable, and session-owned without
   displacing the composer.
6. Add Cmd/Ctrl+L composer focus and centralize global shortcut ownership.
7. Render complete empty/loading/reconnecting/degraded/stale/exhausted/error/approval
   states with literal recovery actions.
8. Apply immediate visual feedback only where rollback is deterministic.

Local gate: component/state tests, keyboard and focus traversal, packaged pointer and
shortcut replay, current-route screenshots, queued-turn replay, session switch/restart,
narrow and large window layouts, and a first-use comprehension dry run by someone who
has not read the repository.

Done: the exact packaged app passes the card's operator-identification task with no
focus theft, hidden queue, or competing runtime hierarchy.

### Phase 4 — run the cold-operator proof before more feature work

Card: `DESKTOP-COLD-OPERATOR-RELEASE-PROOF`.

1. Bind the candidate to one commit, package hash, model/access configuration, and
   local test receipt.
2. Recruit one voluntary, uncompensated non-developer without automating outreach.
3. Observe the uncoached launch-to-useful-result journey and log assistance,
   confusion, time, approval/recovery, and output retrieval.
4. Fix only blocking defects, rebuild a new immutable candidate, and repeat the
   affected path.
5. Preserve the small-sample limitation. Do not claim market validation.

Done: the existing card's executed real-world criterion passes. This is the checkpoint
before opening the parked Desktop and performance work.

### Phase 5 — ground all capability claims

Card: `CAPABILITY-GROUNDED-SYSTEM-PROMPT`.

1. Derive dynamic capability copy from the effective registry after provider, mode,
   project, host, policy, auth, and MCP resolution.
2. Keep the stable prompt prefix isolated for caching.
3. Use the same capability object for prompt, What can I do, setup/status, Desktop,
   and TUI.
4. Give unavailable actions one exact setup or recovery path; never imply execution.

Done: property tests show prompt and UI capability sets equal the callable registry
across all supported modes.

### Phase 6 — continuity and performance wave

Cards: `UX-04` and `QUICKSILVER-DESKTOP-STREAM-PERF`.

1. Give every stream event a durable identity and resume cursor.
2. Resume from the last acknowledged event; deduplicate late/replayed events.
3. Keep background sessions attached to their original project/connection and update
   unread/progress badges without navigation.
4. Persist queue, draft, scroll anchor, unread boundary, approval, and settlement
   state across switch and restart.
5. Coalesce visual deltas, incrementally render stable Markdown, and isolate
   subscriptions.
6. Benchmark realistic long transcripts, images, tool activity, and large diffs with
   render counters and explicit budgets.

Done: forced disconnect/restart produces byte-identical transcripts, no duplicate
events, stable focus/reading position, and a passing packaged performance budget.

### Phase 7 — reliability controls

Cards: `HARNESS-UNIFIED-DEADLINE-FAILURE-CONTRACT`,
`HARNESS-DURABLE-PRECOMPACTION-CHECKPOINT`,
`GLOBAL-PAUSE-NEW-WORK-SENTINEL`, and
`WEB-POLICY-SAFE-RESULT-CACHE`.

Build in this order:

1. Deadlines and owned process-tree cancellation, including the empty-response guard.
2. Durable pre-compaction checkpoint for high-continuity work.
3. Cross-host pause sentinel before expanding unattended execution.
4. Web cache only after a measured repeated-fetch bottleneck and after quarantine
   dependencies are satisfied.

Done: each card's destructive, restart, race, uncertainty, and secret-leak fixtures
pass; no consequential action retries automatically.

### Phase 8 — Desktop lifecycle hardening

Cards: `DESKTOP-CONNECTION-PROJECT-LIFECYCLE`,
`DESKTOP-NATIVE-RESILIENCE-SHELL`, and the enriched
`QUICKSILVER-STARTUP-CRITICAL-PATH`.

1. Implement validated runtime discovery and distinct boot/repair/auth states.
2. Make project cwd authoritative and allow subordinate repos/worktrees/sessions.
3. Add soft connection re-home only after profile identity and background-session
   routing are proven.
4. Add native transcript find, safe window/zoom restore, crash evidence, secure token
   storage, and sleep/wake behavior.
5. Optimize startup only from the existing TTFT baseline.

Done: fresh install, existing runtime, invalid runtime, reconnect, profile switch,
project switch, crash, sleep/wake, multi-display, and restart pass in the packaged app.

## Explicit non-ports

- Do not replace the Vanta kernel, effect gate, WorkItem lifecycle, approvals, or
  receipts with Hermes equivalents.
- Do not copy Hermes' Python agent runtime, provider stack, compaction implementation,
  plugin catalog, source tree, fixtures, branding, visual identity, or local state.
- Do not add remote/cloud connection modes, SSH bootstrap, auto-update, telemetry,
  multilingual localization, Windows/Linux packaging, HUD/pet overlays, or broad
  multi-window behavior without a Vanta user-test signal or an existing roadmap card's
  dependency becoming ready.
- Do not create a second project, session, attention, delivery, or settlement store.
- Do not call current Desktop accessibility, external usability, cross-platform
  packaging, update delivery, or market demand proven until their real paths execute.

## Per-card publication contract

For every implementation card:

1. Start from refreshed current Git state in an isolated worktree.
2. Add tests before or with the behavior boundary.
3. Run focused tests, both TypeScript typechecks, the relevant packaged-app proof, the
   full TypeScript suite, Rust tests when the tree is unchanged, size/architecture
   gates, secret and forbidden-content scans, protected-path scan, and
   `git diff --check`.
4. Record commands, exits, counts, package/receipt hashes, executed versus code-path
   evidence, and remaining gaps.
5. Commit and push only when the current user explicitly authorizes it. Never enable
   paid Actions, merge, release, deploy, notarize, or publish as an incidental step.

## Re-entry

Start with `MCP-EXPLICIT-EMPTY-ALLOWLIST`. Its smallest complete slice is the config
type distinction plus mount/registry mutation tests. Do not begin the Desktop redesign
in the same branch.

The whole plan is complete only when every adopted card reaches its own executed Done
criterion. Roadmap capture and a green build are not completion evidence for product
behavior.
