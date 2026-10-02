# LibreChat-derived Vanta Desktop — implementation record

## Outcome and boundaries

Owner: Jason. The requested product is a complete, ordinary Vanta desktop
agent, not a special interview edition. Reuse LibreChat's actual interface
where it fits, with white/grey Vanta presentation and the existing generalist
engine, history, model connections, tools, memory and permissions underneath.

Now: publish the validated first conversation/navigation port and its installed
evidence. Next: complete normal-profile Stop and remembered-permission checks,
then a bounded Vanta-driven native-app action. Later: coherent opt-in background
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

Normal-profile live Stop, remembered routine approvals across a new task/restart,
and a Vanta-driven native computer/app action still need their own executed
acceptance. The whole Connections/Today/Schedules/Outputs/Settings journey,
project/browser parity, ambient watch → result → global pause/restart, dependency
security integration and deferred unfamiliar-person proof remain open. No
whole roadmap card is promoted. The public release and `main` are unchanged.
