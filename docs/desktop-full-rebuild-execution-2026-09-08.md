# Desktop rebuild continuation

Historical evidence. The [October 2 application checkpoint](development-checkpoint-2026-10-02.md)
supersedes this snapshot's authority, publication and installation status.

Status: implemented local rebuild candidate; **34 packaged scenarios**, the
500-turn navigation replay, actual macOS folder selection, and a separate
zero-pointer native keyboard attachment/approval run pass on the same candidate.
All 12 original-versus-rebuild performance measures pass the unchanged 10% limit.
Full acceptance is **incomplete**: VoiceOver speech/cursor operation is not verified.
The Mac is now accessible; the earlier locked-screen blocker is superseded.
The independent review and real-path testing found the regressions recorded below.
No installed-app replacement, publication, live-account or human-beta proof is claimed.

## Constraint ledger

- Outcome: a capability-complete, chat-first Vanta Desktop workbench using the
  approved Codex interaction direction and Vanta black, bone and violet tokens.
- Target: isolated `codex/desktop-replacement-20260908`, HEAD
  `ab5e8910f2d474ed3e84772bf2262893b9962b5e`, extending its 34 saved dirty paths.
- Must: inspect pinned public upstream source, reuse existing Vanta contracts,
  preserve drafts/queues/approvals, and prove the exact local packaged paths.
- Must not: replace the agent/store, change protected source or operator data,
  overwrite the newer roadmap, publish, release, replace the installed app, or
  enable paid Actions. No foreign checkout or branding enters this repository.
- Authority: local redesign, implementation and isolated verification. Human
  beta, live accounts and installed-app cutover remain separate.

## Source-grounded decisions

The public sources were pinned before implementation. No upstream source,
checkout, dependency, runtime or branding was copied into Vanta.

| Source actually inspected | Decision in Vanta |
| --- | --- |
| Codex `ce254df05a3162a93d8f3357ff4dd86582c534b7`, [thread queue processor](https://github.com/openai/codex/blob/ce254df05a3162a93d8f3357ff4dd86582c534b7/codex-rs/app-server/src/request_processors/thread_queue_processor.rs) | Keep queue identity, edit/remove operations and errors attached to the existing authoritative session service. Do not invent a renderer-only execution queue. |
| Hermes `c8aa5608c24e3636e77c267650c0f1f52e44adb0`, [composer store](https://github.com/NousResearch/hermes-agent/blob/c8aa5608c24e3636e77c267650c0f1f52e44adb0/apps/desktop/src/store/composer.ts) | Keep drafts separate from sent turns, preserve per-session ownership and recover never-sent conversations. Vanta uses its existing draft endpoint and canonical session records. |
| Hermes, [composer queue](https://github.com/NousResearch/hermes-agent/blob/c8aa5608c24e3636e77c267650c0f1f52e44adb0/apps/desktop/src/store/composer-queue.ts) | Preserve visible per-session queue state and stop semantics. Vanta's existing runtime remains the queue executor; preparation and replay never send by themselves. |
| Hermes, [pane geometry](https://github.com/NousResearch/hermes-agent/blob/c8aa5608c24e3636e77c267650c0f1f52e44adb0/apps/desktop/src/components/pane-shell/geometry.ts) and [pane focus](https://github.com/NousResearch/hermes-agent/blob/c8aa5608c24e3636e77c267650c0f1f52e44adb0/apps/desktop/src/store/pane-focus.ts) | Add bounded, persisted geometry, explicit context destinations and focus return. No phantom browser or workspace capability. |

Codex's pinned root license was checked locally: Apache-2.0, not MIT. The public
repository provides the harness/App Server code inspected here; it was not used
as evidence that the proprietary Codex Desktop renderer is available to copy.
Hermes's pinned root LICENSE was read through GitHub's contents API: MIT, Nous
Research. This implementation adapts interaction patterns, not upstream code.

## Existing capability migration

"Executed" below describes this isolated package. "Retained" means the existing
component/contract remains connected; it does not claim an external account worked.

| Existing surface/action | New destination and evidence boundary |
| --- | --- |
| Chat, stream, composer, attachments, model controls | Primary conversation. Send, stop, queue edit/remove/reorder/steer/explicit retry and compact model dialog executed. Failed chat selection preserves draft ownership; mismatched-session submission stops before the provider. Existing provider contracts retained. |
| New task and project picker | Separate New chat / New project task. Actual macOS folder sheet, exact disposable project selection, host restart and draft-only cross-project handoff executed. No model invocation from project creation. |
| Session search, rename, pin, archive | Sidebar with hover/focus metadata and actions. Search, rename, pin, archive/restore executed. |
| Bulk selection, trash, restore, permanent deletion, pin ordering | Library → Chats, using existing safe operations/undo and canonical endpoints. Trash/restore executed; permanent deletion requires typed DELETE and was not exercised against user data. |
| Saved runs, provenance, fork/replay | Library → Reusable runs. Save, detail, Escape, replay review and draft-only preparation executed. Structured file inputs survive replay and sending; a changed source file is detected by the next replay preview. No automatic execution. |
| Workflow run ledger | Library → Workflows. Empty/history surface executed; no new workflow launched. |
| Operator continuity | Today → existing ContinuityView. Route/accessibility executed; existing continuity tests retained. No additional user-facing store. |
| Artifacts and schedules | Outputs and Schedules. Routes/accessibility executed; creating a schedule still prepares an instruction. No schedule executed. |
| Plugins, skills and tool inventory | Skills & tools → full capability inventory, not the former first-18-item summary. Existing runtime tool contracts retained. |
| Messaging, MCP and Google | Connections with exact section routing. Telegram setup destination executed without contacting Telegram. Existing save/test/consent/gateway handlers retained, not invoked with live credentials. |
| Runtime host selection/start/stop | Project dropdown → existing RuntimeStrip. Host tests pass; no external host was selected. |
| Files, reported changes, activity | Context → Files / Review / Activity. Every tab and resize/focus behavior executed. Review explicitly is not an authoritative Git diff. |
| Canvas and reported web sources | Context → Canvas / Web sources. Empty states executed. Links open the browser; this does not create authenticated embedded browsing. |
| Model, appearance, safety, workspace settings; sound; shortcuts | Existing settings components in the unified shell, plus command palette. Settings hands off to model/setup with one dialog, contained keyboard focus and focus return. Theme and palette executed; other existing contracts retained. |
| Approval and recovery | Existing permission/receipt path, visible from workspaces as well as the conversation. Real local kernel + synthetic model: denial leaves the file unchanged; a fresh Allow once permits one bounded edit. |
| Active response outside chat | Visible Return to running chat / Stop response controls; returning to current session does not switch engines or lose draft ownership. Executed. |
| Long-session prompt map and reading position | Original prompt navigator restored in wide layouts. A real packaged 500-turn fixture passes prompt hover/focus previews, bounded rendering, draft typing, switch/restart anchors, detached streaming, wheel/touch/keyboard and reduced motion. |
| Companion and Classic fallback | Existing companion entry retained. Classic entry executed as a recovery option, not required to reach the migrated capabilities. |

## Demonstrated regressions fixed

1. Never-sent drafts had no canonical session record to reopen; two rapid New
   chat actions could also reuse a second-resolution ID. Both tests failed before
   the fix. New empty records and UUID-suffixed IDs pass restart/uniqueness tests
   without manufacturing sent turns.
2. Draft endpoint failure was silent. Saving/error/retry is now visible, and
   navigation waits for a successful ordered save. Packaged failure injection
   demonstrated preservation, blocked navigation and explicit retry recovery.
3. A running response could become difficult to reach after opening Library.
   The current chat remains reachable; workspace-level return/stop was executed.
4. Approval modality exposed an inaccessible background scroll region. Scroll
   access and reversible inert-background isolation were added and replayed.
5. Telegram's credential link used an insufficient-contrast accent. It now uses
   the existing accessible text-accent token. The failing 3.42:1 check then passed.
6. The replacement inline queue omitted ordering, steering and explicit failed-item
   retry. All canonical operations and target metadata are restored. The packaged
   test interrupts a claimed queued turn, retries it explicitly, and confirms no
   new execution until the next submitted turn.
7. Failed chat selection could expose B's draft while the runtime still owned A.
   Renderer ownership changes only after the server accepts selection. Every
   renderer submission carries the expected session ID; the server rejects a
   mismatch before provider invocation or recording a turn. Rejection, delayed
   selection and a real packaged failure/recovery path were tested.
8. Reusable-run preparation dropped structured file inputs. Those attachments now
   survive preparation and submission, retain their original hash, and cause a
   later replay preview to block when the input bytes change.
9. The real replay uncovered duplicate generated @file lines in the existing
   preparation endpoint. A small shared text helper now prevents both preparation
   and submission from appending an existing exact reference.
10. Settings covered its newly opened model picker. Settings now closes before
    model/setup opens. Packaged keyboard containment, Escape and opener focus
    return pass for both handoffs.
11. The extended accessibility replay found the run-detail heading using an
    insufficient-contrast accent. It now uses the accessible text-accent token;
    the same packaged accessibility check passes.
12. The new stylesheet hid the existing prompt navigator without a replacement.
    Removing that override restored its actual hover/keyboard behavior. The
    existing 500-turn proof was adapted to the new sidebar and an isolated model
    fixture; it now passes against the exact package without model requests.
13. Native keyboard attachment disabled the selected file button and dropped its
    focus. It now remains focusable with `aria-disabled`, cannot attach twice,
    and retains focus. Closing the inspector falls back to its real context
    opener when the original palette item no longer exists. Unit tests and the
    native keyboard replay executed both repaired paths.
14. Repeated filtered command-palette use reproduced an unintended New chat
    instead of Library. Query state now belongs to the open palette's lifetime;
    Enter resolves the current input value. Component tests and 12 consecutive
    packaged Library commands preserve the selected chat and session count.
15. New chat could silently do nothing between Stop/completion and canonical
    history reload. Navigation and the composer are now visibly unavailable
    during settlement, with an "Updating conversation…" cue. A packaged test
    holds the actual history response, checks that state, releases it and opens
    a new chat. Queuing remains available during the running response.
16. Retrospective paired runs against reconstructed original HEAD exposed a
    reproducible chat-switch regression: about 397 ms versus 52 ms. A request
    trace found the new navigation latch waiting for an unrelated artifact
    inventory (368 ms). Selection still awaits canonical history, the saved
    draft and current model/permission status; full inventory refresh now runs
    in the background under the existing mutation-version guard. A failed
    current-status read disables input until explicit recovery. Six new unit
    tests cover authority, stale results and background failure. The old package
    failed a held-artifacts interaction test; the rebuilt package passed that
    test plus real status-failure/Retry connection injection. No approval or
    expected-session check was removed.

The final long-session run also exposed a proof-harness timing error, not draft
loss: `pressSequentially` was sending keys to a still-disabled textarea while the
selected session loaded. A diagnostic captured `disabled: true` before typing.
The harness now waits for the actual enabled state; the original exact draft,
switch/restart and reading-position assertions pass. No production change or
fixed delay was added for this test correction.

The added refresh proof initially assumed the fixture title survived a submitted
turn; the canonical store legitimately derives its title when saving. It now
resolves the fixture's stable ID to its current title. A second harness problem
was demonstrated by **zero injected 503 responses** after removing/re-registering
the same route, despite observed 200 responses. One persistent, phase-controlled
route now proves the rejection was delivered. These harness failures were not
reported as application failures or discarded; diagnostic receipts are retained.

The independent skeptic executed isolated handler/component reproductions for
selection, replay inputs and modal order, and inspected queue parity. Its bounded
follow-up confirmed the four fixes at code/test-contract level, not packaged level.
The primary agent subsequently ran the packaged paths and found the duplicate
reference and contrast issues described above. These evidence levels are separate.

No kernel safety rule was weakened for the proof: an initial overwrite scenario
was correctly blocked by the existing kernel. The final approval scenario uses
an ordinary bounded edit and tests actual deny/allow behavior.

## Observable Done criterion

Every existing Desktop entry point has an explicit new-shell destination or a
documented safety boundary. No supported capability is stranded behind Classic.
The exact local package passes new/unsent/saved chat recovery, queue/stop,
model/settings, contextual workspace, approval denial/confirmation, navigation,
error recovery and accessibility checks with retained receipts. Passing builds
alone are not acceptance. External and human-proof limits remain plainly stated.

## Local gate record

Commands run from `vanta-ts/` unless stated otherwise. No paid Actions were used.

| Gate / command | Exit | Observed evidence |
| --- | ---: | --- |
| `npm run typecheck` | 0 | Runtime TypeScript check |
| `npm run desktop:renderer:typecheck` | 0 | Renderer TypeScript check |
| Focused `vitest run` over queue, selection, retained context, state, chat concurrency, attachment text and long-session navigation | 0 | 7 files / 39 tests; `focused-review.log` |
| `npm run typescript:compat:test` | 0 | 1 compatibility test |
| `npm run desktop:host:test` | 0 | 14 host tests + 1 tray test |
| `vitest run` over context focus, command palette and settlement | 0 | 3 files / 9 tests; covers the final native/repetition findings |
| Environment-isolated `npm test` | 0 | 1,571 files; 14,327 passed, 3 skipped; 122.11 seconds; `full-typescript-refresh.log`. Executed after all production changes, including conversation refresh. Includes architecture tests. |
| Root `cargo test --locked` | 0 | 70 passed; Rust source unchanged |
| `npm run desktop:build` | 0 | 1,677 modules; renderer built |
| `CSC_IDENTITY_AUTO_DISCOVERY=false node_modules/.bin/electron-builder --mac dir --arm64` | 0 | Local ARM64 directory candidate, no release signing/notarization |
| `VANTA_NATIVE_PICKER_PROOF=1 node scripts/desktop-chat-first-proof.mjs` | 0 | 34 scenarios; 18 synthetic provider requests; 0 uncaught renderer errors; 23 captures. Actual macOS folder selection, host restart and exact draft handoff passed. Receipt binds the package SHA-256 and checks it did not change during the run. |
| `VANTA_NATIVE_KEYBOARD_ONLY=1 node scripts/desktop-chat-first-voiceover-proof.mjs` | 0 | Native Cmd-K/Tab/Space/Escape/Enter only; 0 pointer events; 1 chat, structured `brief.md` attachment, 1 Allow once, real kernel/file edit and on-disk readback; 2 synthetic provider requests; 0 renderer errors. Explicitly **not** a VoiceOver pass. |
| `node scripts/desktop-chat-first-voiceover-proof.mjs` | 1 | VoiceOver presence check failed; earlier activation attempts did not establish speech/cursor operation. Screen-reader acceptance remains open. |
| Focused `vitest run` over conversation refresh, selection, state and settlement | 0 | 4 files / 19 tests, including 6 new refresh tests |
| `VANTA_REFRESH_BOUNDARY_PROOF=1 VANTA_MEASURE_STOP=1 VANTA_DESKTOP_APP=release/mac-arm64/Vanta.app/Contents/MacOS/Vanta node scripts/desktop-long-session-navigation-smoke.mjs` | 0 | 500-turn real package path; authority held before input, slow artifacts do not block input, injected authority failure disables input, explicit retry restores input. Two synthetic provider requests, including the held Stop scenario. |
| `node --test scripts/lib/desktop-performance-budget.node-test.mjs` | 0 | 4 budget tests |
| `node scripts/desktop-performance-budget.mjs` via paired driver | 0 | All 7 unchanged budgets pass in each of 6 resource runs. Current-candidate medians: cold start 2,485.57 ms, first use 873.56 ms, idle 783.61 MB, active CPU 28%. Each resource run includes 3 cold launches. |
| `VANTA_DESKTOP_APP=release/mac-arm64/Vanta.app/Contents/MacOS/Vanta VANTA_MEASURE_STOP=1 node scripts/desktop-long-session-navigation-smoke.mjs` | 0 | Five candidate runs and five original runs; 500-turn switch/relaunch/stream/keyboard/touch/reduced-motion paths, plus a synthetic held response and real Stop. |
| `VANTA_COMPARISON_OUTPUT=.artifacts/chat-first-proof/comparison-after-fix VANTA_BASELINE_APP=<reconstructed-original.app> VANTA_BASELINE_REVISION=ab5e8910f2d474ed3e84772bf2262893b9962b5e node scripts/desktop-rebuild-comparison.mjs` | 0 | Alternating paired order; 5 long-chat and 3 resource runs per package. All 12 relative measures pass; no simultaneous build/test workload. Exact commands, sample values and app hashes retained. |
| `runLint("..", chatFirstProductionPaths)` | 0 | 21 new production modules, including conversation refresh, within 300 lines / 50 per function / 4 parameters / complexity 10 |
| Baseline comparison for modified existing production files | 0 | No new violation count: run-library 1→1, state 5→5, composer attachments 1→1, handlers 10→10, main/rail 0→0. This is not a whole-repository size-clean claim. |
| `RoadmapSchema.parse(...)` + ID/`after`-dependency DFS | 0 | 1,341 cards and 462 real dependency edges; no duplicate/missing/self/cyclic dependencies. Four mutation checks reject each invalid graph class. No roadmap edit. |
| `semgrep scan --config p/typescript --metrics off --error --json <27 production paths>` | 0 | 74 rules; 0 findings/errors |
| Root `./scripts/secret-scan` | 0 | 2,178 commits and tracked/non-ignored snapshot; 0 findings |
| `npm audit --omit=dev --json` | 0 | Runtime dependencies: 0 vulnerabilities at this check |
| `node scripts/desktop-rebuild-evidence.mjs` | 0 | Full tracked/untracked diff, hashes, protected/forbidden paths and whitespace checked |
| `gh api repos/jpoindexter/Vanta/actions/permissions --jq '{enabled}'` | 0 | `enabled: false` |

The full suite used `env -i` with only PATH, HOME, TMPDIR, LANG and a fresh
`VANTA_HOME`. Packaged interactions used a loopback model fixture and disposable
project, app profile and Vanta state. The performance harness now also uses a
loopback provider and an environment allowlist instead of inherited credentials.

## Retained evidence

The ignored directory `vanta-ts/.artifacts/chat-first-proof/` contains
`result.json`, `native-refresh.log`, `comparison-after-fix/result.json`,
`refresh-boundary-final.json`, `voiceover/result.json`, source/security logs, captures,
`proposed.patch` and `file-manifest.json`. Earlier blocked/native, `*-review` and
diagnostic failure receipts are historical, not the final verdict. The manifest is regenerated
after documentation edits and includes every added/deleted/modified path and SHA.
The current package is `vanta-ts/release/mac-arm64/Vanta.app`.
The saved uncommitted diff contains **70 changed paths**, 4,312 insertions and
542 deletions. HEAD, the installed checkout and all protected source remain unchanged.

| Artifact | SHA-256 |
| --- | --- |
| Candidate `app.asar` | `6db39ffd99e428b796f2924a3852671b7133bec29eca324d5bbff4715386ef0d` |
| 34-scenario receipt (includes native picker) | `49d776a466c15a681d2683a9752feb729332237dae6100d22835ba831edd9185` |
| Paired performance receipt | `4e668518fb5fcf2176bfb220fac4aeae8aa8dc94c694f718e961c507a91b33bc` |
| 500-turn / refresh-boundary receipt | `fc8fa023313eabc32217836a3a58f2aadb3773f0851fc71bbe699a0f55825e90` |
| Native keyboard receipt (screen reader excluded) | `a7473681832b17418cd30b20231a842725f6fff9ef211d015cfcb6f66875324c` |
| Production source manifest | `cf507e329f95c58571f02d6a9472bbe1d8b99ec5a02f11ffe99a3997ad5f6195` |

Visual inspection covered the actual packaged conversation, restored queue controls,
run review and narrow Library captures. Automated accessibility checks cover main landmarks, contrast,
dialogs, context tabs, workspaces and 200% zoom. They do not establish complete
WCAG conformance or unfamiliar-person usability.

## Retrospective original-versus-rebuild comparison

The original package was reconstructed **retrospectively** from `git archive`
of original HEAD `ab5e8910f2d474ed3e84772bf2262893b9962b5e`, outside the repository.
It used an APFS copy of the existing dependency tree, the unchanged package/lock
files and kernel binary, Node 22.23.2 and Electron 43.4.0. No package dependency
was added. The original renderer asset names exactly matched tracked HEAD.
The baseline build and unsigned ARM64 directory packaging both exited 0.
Its `app.asar` hash is
`162a07d5efa8ae6f1632a403e16663a9a62ce89e18c138c04118e0f47e5e9cc5`.
Both packages were then measured on the same Apple M4 Pro, 48 GiB host with
disposable state, identical harnesses and a synthetic loopback provider.

| Median measure | Original | Final rebuild | Change |
| --- | ---: | ---: | ---: |
| Draft typing | 122.94 ms | 115.90 ms | −5.7% |
| Scroll and position persistence | 244.23 ms | 244.80 ms | +0.2% |
| Switch to short chat | 51.20 ms | 39.01 ms | −23.8% |
| Return to long chat and anchor | 559.57 ms | 493.40 ms | −11.8% |
| Stop and restore input | 106.32 ms | 99.92 ms | −6.0% |
| Cold startup | 2,428.99 ms | 2,485.57 ms | +2.3% |
| First-use harness | 888.63 ms | 873.56 ms | −1.7% |
| Idle process-tree memory | 789.59 MB | 783.61 MB | −0.8% |
| Active process-tree CPU | 30.2% | 28.0% | −7.3% |
| App archive | 129,186,738 bytes | 129,269,050 bytes | +0.06% |
| Unpacked resources | 54,209,237 bytes | 54,209,237 bytes | 0% |
| Allocated installed size | 520,925,184 bytes | 514,564,096 bytes | −1.2% |

All median changes are within the unchanged 10% threshold. No slower latency
pair exceeded that threshold; one of three CPU pairs did, while the CPU median
improved. This is repeated local automation evidence, not broad statistical,
live-provider, first-token, VoiceOver or human-usability proof. Absolute startup
and resource budgets passed independently in each completed resource run.

Before the refresh fix, five paired runs reproduced approximately 397 ms versus
52 ms for short-chat switching, and a smaller Stop regression. Those samples,
the 368 ms artifact trace and the failing held-artifact check remain retained.
The first comparison attempt also encountered a baseline third-window launch
timeout, so that attempt was not called green. The harness now closes a launched
app on readiness failure. A fresh complete comparison passed with no retry,
threshold change or removal of unfavorable samples from that complete run.

## Remaining gates and exact re-entry

- **Now:** complete an observed current-candidate VoiceOver replay. Run
  `node scripts/desktop-chat-first-voiceover-proof.mjs`, enable VoiceOver on the
  Mac, and use its cursor/spoken feedback to open Context, attach `brief.md`,
  submit `Approval proof allowed`, inspect the bounded edit, Allow once and read
  the settled response. Enter checkpoint labels and finally `verify` in the
  driver's terminal. That driver's assertions prove the keyboard/runtime path;
  a separate observer must attest the actual screen-reader speech and operation.
  Do not use the keyboard-only flag to clear this gate. Native folder selection
  is already executed on this candidate and does not need speculative rework.
- **Then:** review the actual candidate with the owner. The installed application
  was deliberately not replaced; launching the existing installation still opens
  the old build. Installation/cutover requires a separate explicit step.
- **Later:** unfamiliar-person beta, live-account/provider checks, authenticated
  embedded-browser work, release signing/notarization and publication remain
  unexecuted. No roadmap card was promoted. The newer roadmap worktree has its
  own changes and was not overwritten by this older 1,341-card branch.
- The isolated non-Git test folders produced 65 expected Git-probe stderr entries;
  the UI remained operational. There were zero uncaught renderer errors, not
  zero host diagnostics. The production bundle still emits the >500 kB chunk
  warning; measured performance budgets nevertheless pass unchanged.
- Root protected files, live accounts and operator state were untouched. Installed
  HEAD remained `4cb3dae364988bf09cbea91871b8cf22a2ddc3fa` with the same three
  unrelated untracked scripts. This branch stays at its original HEAD with a
  reviewable local diff; no commit, push, tag, merge, deployment or release.

The native keyboard proof completed with the actual structured attachment and
one-time local approval, not synthetic DOM key events. VoiceOver was not running
at the final presence check; its enabled flag was 0, and the test-opened utility
was closed. No accessibility permission was broadened. Process presence, an AX
snapshot and ordinary keyboard success are not speech/cursor verification.

The latest host check used the actual System Settings Accessibility → VoiceOver
switch with Vanta **not running**. The switch turned on and then returned off;
no VoiceOver process remained and the enabled flag was 0. No crash report was
found. Narrow speech/audio log errors do not establish the cause, so this is
not labeled a Vanta crash or a diagnosed operating-system fault. System Settings
was returned to its original General page; no security permission was changed.

The full-rebuild goal remains open for observed screen-reader acceptance. Do not
turn the native keyboard result into VoiceOver proof or the automated matrix
into beta acceptance. Re-enter from this report and candidate; do not rebuild
the design from scratch.

Skills materially applied: use sweep, ND decomposition/working memory,
source-grounded research, design/dec/Hallmark workbench and cognitive-load rules,
Vanta design-system extraction, accessibility, frontend testing, code-size,
agent guardrails, security preflight, cc-verify and verified-done claim discipline.
