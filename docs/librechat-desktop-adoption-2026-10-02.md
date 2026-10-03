# LibreChat-derived Vanta Desktop — implementation record

## Outcome and boundaries

Owner: Jason. The requested product is a complete, ordinary Vanta desktop
agent, not a special interview edition. Reuse LibreChat's actual interface
where it fits, with white/grey Vanta presentation and the existing generalist
engine, history, model connections, tools, memory and permissions underneath.

Now: finish the normal-profile conversation-activity correction and carry the
same LibreChat presentation through the remaining everyday interactions. Next:
remembered-permission checks and a bounded Vanta-driven native-app action.
Later: coherent opt-in background
follow-through and deferred unfamiliar-person acceptance. This is not the whole
desktop redesign.

Execution is isolated on `codex/librechat-shell-adapter-20261002`, based on
`d1668cce432e2bf4007ef6d039bf3056e91f06eb`. The guarded updater replaced the
installed app only after the candidate's applicable gates passed. No paid service,
second conversation database, LibreChat server, account mutation, release,
main push or history rewrite is authorized.

## Pinned source, not a screenshot recreation

Reviewed LibreChat source:
`f10b1d91f1eee3a2c82d5247bf620351486b7c1b`.

- [ChatView](https://github.com/LibreChat-AI/LibreChat/blob/f10b1d91f1eee3a2c82d5247bf620351486b7c1b/client/src/components/Chat/ChatView.tsx):
  landing/conversation composition, stable composer band, reading column and
  accessible page heading.
- [ExpandedPanel](https://github.com/LibreChat-AI/LibreChat/blob/f10b1d91f1eee3a2c82d5247bf620351486b7c1b/client/src/components/UnifiedSidebar/ExpandedPanel.tsx):
  persistent icon navigation, host-owned selected state and bottom settings.
- [Chat surface contract](https://github.com/LibreChat-AI/LibreChat/blob/f10b1d91f1eee3a2c82d5247bf620351486b7c1b/client/src/components/Chat/Subagents/surface.tsx):
  host-owned behavior rather than another engine/store in a feature.

The root MIT notice is retained with the adapted source and as a renderer public
asset (`third-party/LibreChat-LICENSE.txt`) for packaging. The upstream package
metadata also says ISC; this bounded port takes only the identified
repository source, not its dependencies, asset collection or complete client.
Recoil, Jotai, React Query, its router/auth, MongoDB, RAG services and Sandpack
are not imported. A larger import requires its own dependency/license review.

## Retained capability and evidence map

| Journey | Vanta authority retained | Required candidate evidence |
| --- | --- | --- |
| New/open/search/pin/archive chat | Existing session API and navigation actions | Distinct history/draft restoration; no setup prerequisite |
| Send/stream/stop/recover | Existing conversation hooks and Desktop API | One request/turn; partial output kept; no duplicate executor |
| Follow-up while busy | Existing durable queue | Visible edit/remove and exactly-once continuation |
| Attach files / screen context | Existing isolated native bridge | Explicit context chips and removal; no silent capture |
| Models and permission scope | Existing provider capabilities and approval API | Supported controls and unchanged enforcement |
| Decisions and approvals | Existing pending approval identity | Exact action, denial and persistence failure remain visible |
| Read results | Existing project-bound document workbench | Result link opens beside the originating chat |
| Today / connections / schedules / tools | Existing workspace views | Return to the same conversation/draft, including a running turn |
| Mini / avatar | Existing native surface bridge | Same state and authority, no second agent |

These are acceptance requirements, not completion claims. Automated fixture
proof, installed normal-profile proof and unfamiliar-person proof remain
separate. No card status is promoted by importing interface source.

The owner's additional ClickUp ambient-AI reference is mapped to existing
canonical cards in [the ambient workflow contract](desktop-ambient-workflow-2026-10-02.md#owner-addition-ambient-follow-through-not-only-a-chat-shell).
This shell port is only the presentation layer; it does not itself deliver
background event processing, notification policy or global pause.

## Re-entry

Resume from the installed hash and branch below, not an older screenshot or
worktree. Preserve the saved acceptance draft. Check normal-profile Stop and
remembered routine approval on disposable work before claiming those journeys
complete. Keep API routes, credentials, user stores, Rust and factory unchanged
for this presentation port; broader changes need a separate bounded slice.

## Executed local candidate

The first adaptation changes presentation, not Vanta's runtime or stores.
`librechat/chat-view.tsx` supplies the shared landing/transcript/composer layout;
`librechat/sidebar-rail.tsx` supplies the memoized labelled navigation controls.
`chat-workspace-navigation.tsx` maps those controls to existing Vanta views,
settings, theme, New chat and optional project-task actions. The four existing
chat-first composition modules and `main.tsx` consume those components. Scoped
`presentation.css` uses Vanta's semantic tokens; the production renderer was
regenerated by Vite. No upstream dependencies or lockfile changes were added.

| Gate | Executed command (in `vanta-ts` unless stated) | Exit / observed result |
| --- | --- | --- |
| Renderer regression | `npx vitest run desktop-app/src --reporter=dot` | 0; 62 files, 247 passed |
| Final focused renderer/roadmap/ambient primitives | `npx vitest run desktop-app/src src/roadmap src/ambient src/proactive --reporter=dot` | 0; 84 files, 468 passed; ambient primitive tests do not prove ambient Desktop integration |
| Full canonical suite | `npm test -- --reporter=dot` | 0; 1,594 files, 14,492 passed, 3 skipped; rerun after source changes |
| Runtime typecheck | `npm run typecheck` | 0 |
| Renderer typecheck | `npm run desktop:renderer:typecheck` | 0 |
| TypeScript compatibility | `npm run typescript:compat:test` | 0; 1 passed |
| Production package | `npm run desktop:pack` | 0; production renderer, native kernel build, local Developer ID signing and strict deep verification; no release/notarization |
| Packaged workflow | `node scripts/desktop-chat-first-proof.mjs` | 0; 57 checks, 27 local-fixture provider requests, zero renderer errors |
| Guarded installed update | `npm run desktop:rebuild` | 0; reran both typechecks, 7 installer tests, production package/signature verification and all 57 packaged checks before replacement; installed and tested archive hashes match |
| Changed production size | `runLint` from `src/lint/run.ts` with the eight explicit changed production TS/TSX paths | 0; file ≤300, function ≤50, parameters ≤4, complexity ≤10 |
| Architecture | Root `node scripts/check-boundaries.mjs` | 0; all 5 boundaries |
| Static security | `semgrep scan --config p/javascript --config p/typescript --metrics=off --error` over those eight paths | 0; 74 executed rules, 8 files, zero findings; not a dependency audit |
| Canonical projection | Root build-order, current-projection and website generators; `node --test scripts/build-order.test.mjs scripts/roadmap-current-projection.test.mjs` | 0; 7 tests; all 1,362 identities/statuses/dependencies/acceptance fields unchanged; five notes refined |
| Final roadmap regression | `npx vitest run src/roadmap --reporter=dot` | 0; 15 files, 173 passed after the installed-evidence note |
| Repository secrets | Root `bash scripts/secret-scan` | 0; 2,184 history commits plus tracked/non-ignored snapshot, zero findings; ignored operator state is outside this scan |
| Protected paths and whitespace | Explicit changed-path assertion plus `git diff --check` | 0; no Rust, factory, MANIFESTO, credentials, operator state, upstream checkout or quarantine paths in the proposed change |

Exact tested candidate ASAR:
`d430d9f463a902a7798d09c04fe6efb82e22bfe3d1eb0e261abaa619d9ed248e`.
Packaged license content was extracted from that archive and matched to the
source MIT notice. Screenshots were inspected for the empty chat, conversation,
collapsed rail, and collapsed-history/document split. The packaged run also
checks light/dark, narrow widths, keyboard paths and zero serious/critical axe
findings on the exercised surfaces. This is not native assistive-user proof.

Failure evidence is retained in ignored local artifacts. The size gate first
reported one sidebar complexity violation (12 > 10); separating the history
renderer resolved it. The initial packaged run passed 47 checks, then its
unscoped `Chats` selector matched both rail and Library controls. Scoping the
Library check to its labelled navigation retained the intended assertion; the
entire 57-check path then passed on the same archive. The 83 host diagnostic
entries reduce to expected Git probes in the deliberately non-repository
temporary project, not renderer exceptions. No failed gate was relabelled a pass.

The fixture run uses disposable state and real Electron/preload/API/kernel,
but a synthetic provider, simulated OS folder selection and simulated monitor
bounds. No live account, normal-profile current-model turn, new ambient watch,
native computer-control effect or unfamiliar-person acceptance is proved by it.
Installation and source publication must be checked independently below.

## Installed normal-profile evidence

The guarded local updater finished at `2026-10-02T19:59:45.953Z`.
Independent `shasum -a 256` checks of the candidate and
`/Applications/Vanta.app/Contents/Resources/app.asar` both returned the exact
`d430d9f4…` hash recorded above. The prior `8dd23904…` app is retained at
`~/Library/Application Support/Vanta Local Updates/update-5DxRjs/Vanta.app`,
alongside the updater receipt. No conversations, credentials or CLI installation
were replaced.

Native interaction with that exact installed app observed:

- The earlier real-provider conversation and unsent acceptance draft reloaded.
- Collapsing history retained New chat, Chats, Activity, Connections and Settings
  in the compact rail. Activity → Back to chat restored the same unsent draft.
- Mini Vanta retained the conversation and draft. Clicking the existing
  `research.md` result expanded the same workspace and displayed the real
  document body and both MDN source links beside the chat. The draft stayed
  unchanged and unsent. This closes the earlier inconclusive normal-profile
  mini-link check.
- The white/grey chat/document split was visually inspected. No model turn,
  permission change, account operation or new background watcher was triggered.

The first native accessibility click reported a stale element ID. A fresh
screenshot and a click on the visible link completed the actual user path; this
is pointer interaction evidence, not proof of the native accessibility click
path or VoiceOver operation. The earlier research generation itself was on the
preceding package, not rerun here.

## Remaining product gates

Normal-profile remembered routine approvals across a new task/restart and a
Vanta-driven native computer/app action still need their own executed acceptance.
Live Stop was executed on the preceding package; the activity-isolation replay
below was executed on the current package. The whole
Connections/Today/Schedules/Outputs/Settings journey,
project/browser parity, ambient watch → result → global pause/restart, dependency
security integration and deferred unfamiliar-person proof remain open. No
whole roadmap card is promoted. The public release and `main` are unchanged.

## Continuing acceptance and design pass

The owner reiterated that LibreChat's already-designed chat interface is the
base, not a request for another invented visual direction. The relevant design
skills are applied by surface: chat/app-shell/navigation flows; components and
their complete states; light-theme colour/contrast; keyboard/accessibility;
and Nielsen, Norman and AI-native interaction principles. They do not authorize
an unrelated design system, backend replacement or unimplemented controls.

The installed `d430d9f4…` app completed a normal-profile text-only live Stop
interaction: the operator clicked Stop during the response, Send returned,
partial output remained, and switching away/back retained 137 complete numbered
items plus the partial 138th item. No tool or account action was requested.
That run exposed a separate defect: another conversation inherited the stopped
conversation's activity labels even though its own messages and draft restored.

The correction loads the selected conversation's latest recorded activity, or
clears it if there is no receipt. Four regression tests failed before the
correction and passed after it. The full suite then passed with 14,496 tests and
3 skipped. A packaged-test selector initially matched both summary and evidence
text, so the guarded updater stopped before installation. The corrected rerun
passed all 57 packaged checks and installed the signed candidate at
`2026-10-02T20:52:46.552Z`. Candidate and installed ASAR independently matched:
`b4c9c7d1965e30b8351106a21b507537528aa1eea48d6c885eac20b7a53cd505`.
The prior `d430d9f4…` app and receipt are retained outside Git in
`Vanta Local Updates/update-gbl3D5/`.

After the owner unlocked the Mac, the actual installed app restored the research
conversation and draft. Opening the stopped conversation retained its partial
response and stopped receipt. Returning to the research conversation showed its
own completed receipt, no stopped status, and the exact unchanged unsent draft.
No new model request, permission grant or account action was performed in that
replay. This executes the demonstrated activity-isolation criterion, not the
remaining whole-product criteria. Its screenshot still shows excessive tool
result presentation; the next UI slice addresses that using upstream source.

| Correction gate | Command | Result |
| --- | --- | --- |
| Focused selection/draft/chat | `npx --no-install vitest run desktop-app/src/session-selection.test.ts desktop-app/src/session-drafts.test.ts desktop-app/src/chat.test.tsx` | exit 0; 22 passed |
| Full suite | `npm test` | exit 0; 1,594 files, 14,496 passed, 3 skipped |
| Guarded build and installation | `npm run desktop:rebuild` | exit 0 after selector correction; both typechecks, 7 installer tests, signed production package, 57 interactions, 27 fixture-provider requests, zero renderer errors |
| Changed production size | `runLint` with explicit `desktop-app/src/conversation-sessions.ts` | exit 0; no violations |
| Architecture | Root `node scripts/check-boundaries.mjs` | exit 0; 5 boundaries |
| Changed production security | `semgrep scan --config p/javascript --config p/typescript --metrics=off --error desktop-app/src/conversation-sessions.ts` | exit 0; 74 rules, zero findings |
| Roadmap and projections | `npx --no-install vitest run src/roadmap`; root generators and their Node tests | exit 0; 173 roadmap tests, 7 generator tests; generated projections unchanged |
| History and snapshot secrets | Root `bash scripts/secret-scan` | exit 0; 2,185 existing commits plus tracked/non-ignored snapshot, zero findings |
| Proof syntax / whitespace | `node --check scripts/desktop-chat-first-proof.mjs`; `git diff --check` | exit 0 |

The packaged rerun recorded 85 expected host diagnostics from Git probes in the
non-repository fixture; this is separate from its zero renderer errors. The
installed replay does not re-prove fresh research generation or remembered
permission persistence. The CLI installation was not changed.

Next source-level presentation candidates, reviewed at the same upstream pin:
`Chat/Input/ChatForm.tsx` (context above the growing input, one action row) and
`Chat/Messages/MinimalHoverButtons.tsx` plus `styles.ts` (quiet message actions
that remain available on keyboard focus and touch). These are source references,
not a claim that those components have already been ported.

## Compact tool activity — source adaptation

The next bounded port uses the same pinned LibreChat source:
`client/src/components/Chat/Messages/Content/ToolCallGroup.tsx` for its compact
ghost disclosure header, tool-name summary and inset evidence rail, with the
related `ActivityPhaseGroup.tsx` failure-visible folding pattern. Vanta uses
native keyboard-operable `details`/`summary`, its existing semantic colour
tokens and its own recorded messages/events. No upstream state store, runtime,
animation system, authorization handler or extra dependency is imported. The
existing MIT notice covers the new attributed presentation files.

The previous UI printed complete tool outputs as always-visible cards, placed
empty assistant bubbles before tool-only turns, and labeled any returned output
as green "done". The new presentation starts with a compact neutral summary and
opens full escaped text on demand. Missing and empty recorded results are
distinct. Completed trace groups collapse together, but structured failures and
active steps stay visible; pending approvals and recovery controls are not
inside that fold. Earlier groups retain their full evidence, not just labels.

Seven new regression cases failed against the previous presentation and passed
after the change. The focused component/chat check passes 16 tests, the complete
renderer check passes 258 tests in 63 files, and the full suite passes 14,503
tests with 3 skipped in 1,595 files. Both typechecks, the size gate over five
production files, five architecture boundaries and changed-source Semgrep
passed. This source-only checkpoint is superseded by the
[October 3 spacing and installed-package record](desktop-spacing-and-activity-2026-10-03.md):
60 packaged checks passed on final signed ASAR `1eb44d03…`, including keyboard
tool evidence, strict compact row height, aligned/growing input and single-preview
ownership. Guarded installation passed with rollback. Final native inspection in
the normal profile remains pending Mac unlock; fixture proof does not establish
live-provider or whole ambient-workflow completion.
