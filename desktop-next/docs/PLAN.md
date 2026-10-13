# Vanta Desktop Next: build plan (2026-10-13)

Single source for the plan. Trello mirrors it card by card (list names starting "DN"). When this file and Trello
disagree, this file wins, then fix Trello. Evidence and the full per-feature matrix are in the files linked at the end.

## 1. Outcome and done

Outcome: replace the current Vanta Desktop renderer with a robust shell built on the Hermes desktop app (MIT),
redesigned to a Codex/Claude-Code-grade layout in Vanta's own colors, wired to Vanta's server, approvals and queue.

Done for the milestone (all must run end to end, not just compile):
1. Launch the new renderer from the packaged app and land in a usable chat (composer focused, last chat restored).
2. Create or open a session, send, see streamed text and tool rows, Stop, queue a follow-up, restart and keep the thread.
3. Approvals render as an exact-action card; Allow once, Always (project scope) and Reject work and persist across restart.
4. Workbench opens on intent with Changes, Files, Outputs (read-only); Home shows Needs you, Running now, Next up, Outputs.
5. Light and dark, 1440, 1100 and 800 wide, keyboard-only traversal, VoiceOver names, reduced motion.
6. No Nous branding, no usage metrics, no network call the user did not start.
7. Packaged candidate proven (hash recorded) and installed only after guarded-installer checks; old renderer stays until parity.

Not done means partial. Fixtures, a build, a screenshot or model prose are not proof.

## 2. Owner directives (2026-10-13, condensed)

- Take the Hermes desktop and redesign it; its current design is not acceptable.
- Match the structure and feel of Codex or Claude Code one to one, but keep Vanta's colors (white/grey, violet accent).
- Closest fonts and icons are fine. Pick the best layout for an agent dashboard.
- Add the Hermes features that make sense for Vanta; check the code.
- Use all design skills; search skills.sh for gaps.
- Wireframe first (done and approved: "this looks pretty good").
- Fix constant re-asking for approvals (done at the policy layer, see section 8).
- Capture everything in Trello so we can build this or rework the current app.

## 3. Decisions (locked unless new information)

| # | Decision | Alternatives | Why | Reversible |
|---|---|---|---|---|
| D1 | Base = Hermes desktop (MIT) imported to `desktop-next/`, own dependency tree | Patch current CSS; fork whole Hermes with its Python backend | Robust shell, design contract and tests already exist; adapter is cheaper than rebuilding a shell | Yes, folder is additive |
| D2 | Design = structural clone by observation of Codex/Claude Code, Vanta colors, our own code | Copy the Codex shell (proprietary); warm Claude palette | Copyright and the handoff boundary; owner chose Vanta colors | Yes |
| D3 | Layout = sidebar + thread + optional workbench, with a supervision Home (concept A merged with B and C) | Three-pane inbox; status board | See wireframe and Concepts tab | Yes, before build |
| D4 | Remove Nous telemetry, consent prompt, branding, hosted features | Keep opt-in metrics | Vanta collects nothing; consent prompts are noise | Yes |
| D5 | Keep Vanta's Electron main; add a bridge facade and a `VantaGateway` adapter; do not port Hermes main | Port Hermes main and Python bootstrap | Hermes main is about 400 files of Python/SSH/cloud/updater concerns | Yes |
| D6 | Trust model unchanged: approvals project-scoped, kernel and effect gate on every write; raw-power features read-only first | Port Hermes file write, pty, git worktree directly | STRATEGY and SECURITY | Yes |
| D7 | Slice 1 is one live session | Concurrent sessions now | Vanta server state is a singleton | Until per-session state lands |
| D8 | No installed-app swap until packaged proof and guarded installer; the app is running now | Install immediately | Active run, rollback required | n/a |
| D9 | Fonts: system UI sans, Inter fallback, JetBrains Mono (bundled). Icons: Tabler (MIT). 12px text floor | Anthropic/OpenAI fonts | Licensing | Yes |

## 4. Constraints and non-goals

- No code, icons, fonts, images or logos from Codex, ChatGPT or Claude apps. Observation and numbers only.
- Keep `desktop-next/LICENSE-HERMES-MIT` and `NOTICE.md` with copied code; `@vscode/codicons` is CC-BY-4.0 (attribute).
- No paid services, no GitHub Actions, no push to main, no release, notarize or deploy, no Rust or MANIFESTO edits.
- Preserve existing work: current renderer, shipped proofs and the uncommitted designer work stay until reviewed.
- Non-goals for the milestone: pets, starmap, kanban, billing/free tier, Nous account, SSH/cloud connections, plugin marketplace.

## 5. Layout contract (from the approved wireframe)

Sidebar 275px (240-520), nav rows 36, session rows 32, Needs you group only when something waits. Titlebar 44 with
one status pill. Thread column 720. Composer radius 22, Send becomes Stop in the same slot, queue above it. Workbench
closed by default, 400px docked at 1280+, overlay below. Collapse: 1024-1279 rail 56 plus overlay workbench; below
1024 drawer plus sheet. Home order: composer, Needs you, Running now, Next up, Recent outputs. Metrics measured from
Codex: sidebar clamp(240, 275, 520), titlebar 44, toolbar 46, thread 640, composer radius 22, hairline borders.
Full text: `DESIGN-VANTA.md`. Clickable: `wireframe/vanta-desktop-wireframe.html`.

## 6. Workstreams

| ID | Workstream | Done when (observable) | Depends on |
|---|---|---|---|
| DN-01 | Design system and Vanta theme | `DESIGN.md` updated; `vanta` theme default light/dark; tokens only, 12px floor; contrast checked | wireframe approved |
| DN-02 | Shell chrome | Titlebar, sidebar, nav, Needs you, status dots, resize, collapse order verified at 3 widths | DN-01 |
| DN-03 | Chat surface | Empty state, thread, tool rows, diff card, inline approvals, composer, hover actions, jump-to-latest | DN-01, DN-06 |
| DN-04 | Home dashboard | Four blocks live from Vanta routes with empty/loading/error states | DN-06, WorkItem projection |
| DN-05 | Workbench panes | Changes, Files, Outputs read-only; Browser and Terminal gated or later | DN-06, DN-07 |
| DN-06 | VantaGateway adapter and server events | About 18 RPCs mapped; typed SSE events; approval push; boundary token | server work |
| DN-07 | Electron bridge facade | About 40 members real, rest rejecting `unsupported`; renderer boots without throwing | DN-06 |
| DN-08 | Capabilities, connections, skills, settings, onboarding | Panes rewritten against Vanta routes; secrets never displayed | DN-06 |
| DN-09 | Schedules | Create, pause, resume, run now, delete with receipts; missed-run truth | server write routes |
| DN-10 | Native extras and concurrency | Notifications, find, quick entry, tiles, gated terminal, rewind | per-session server state |
| DN-11 | Brand and telemetry removal | Zero Nous strings, assets, URLs; no metrics (telemetry done in a2f303d4) | none |
| DN-12 | Approvals and permissions UX | Manage/revoke surface; shell grants decision; honest one-way-door copy | DN-06 |
| DN-13 | Verification and release | Proof scripts ported, visual regression, a11y, packaged hash, guarded install | each slice |
| DN-14 | Cutover and parity | Old renderer retired only after the parity checklist passes | DN-02..05 |

## 7. Slice order (build order)

Slice 1 Chat on Vanta (DN-01..03, 06, 07, 11 remainder, 12 partial). Outcome: usable chat end to end with one live session.
Endpoints that exist today: `GET /api/status`, `/api/sessions`, `POST /api/sessions/{new,open,rename,archive,delete,bulk,pin}`,
`POST /api/chat`, `GET /api/events`, `POST /api/chat/stop`, `GET/POST /api/chat/queue`, `GET/POST /api/approval`, `GET /api/models`,
`POST /api/model`, `/api/model-settings`, `/api/access-mode`, `/api/setup`, `GET /api/files`.
Server work: typed SSE events (`tool.start{id,name,args}`, `tool.complete{id,ok,summary}`, `approval.request`, `turn.complete{reply}`),
`sessionId` on `/api/chat`, remap PUT/PATCH/DELETE to POST in the bridge `api()` proxy. Risk high.
Slice 2 Workbench read-only (DN-05): Files, Review, Activity, Canvas/Outputs, preview; confined `readDir`, `git.repoStatus`, `git.fileDiff`.
Server work: file tree paging beyond 400 entries. Risk medium.
Slice 3 Agent dashboard (DN-04): WorkItems by the nine states, runs, workflow runs, queue, wake, continuity, release proofs.
Server work: a WorkItem projection endpoint and `workitem.changed` event (none exists). Risk medium-high.
Slice 4 Capabilities, messaging, settings, onboarding (DN-08). Rewrite the 99-file settings tree as Vanta panes; no generic schema forms.
Slice 5 Schedules (DN-09): `POST /api/schedules/{create,update,pause,resume,trigger,delete}`, `GET /api/schedules/{id}/runs`, effect gate and receipts.
Slice 6 Native extras and concurrency (DN-10): per-session server state first; each item gets its own trust review.

Estimates (ranges, named hidden costs). Revised upward from the earlier "4/8/14 sessions for the whole port": the matrix showed
adapter, server events and a 99-file settings tree. Working sessions: S1 3/5/9, S2 1/2/4, S3 2/3/6, S4 3/5/8, S5 1/2/3, S6 4/7/12.
Usable chat plus workbench (S1+S2) about 4/7/13. Full parity about 14/24/42. Hidden costs: proof scripts pin old selectors,
Tailwind v4 and assistant-ui upgrades, Electron packaging of a second renderer, the flaky 79-check proof, server work in protected paths.
Checkpoint after S1; stop and replan if S1 exceeds 9 sessions.

## 8. State of work at capture time

Repo `jpoindexter/Vanta`, feature stack on `codex/librechat-shell-adapter-20261002` (draft PR #60).
- Branch `claude/vanta-desktop-agent-rebuild-20261013` @ 7b86fc08, draft PR #63 (base is the stacked branch): exact-action approval card,
  project-scoped remembered approvals, inner-approval lookup fix, one-way-door false positives fixed (edit paths with deploy/production no longer re-ask),
  honest waiting status, narrow launch fix. Real-Electron proof `vanta-ts/scripts/desktop-approval-persistence-proof.mjs` passes.
- Branch `claude/dependency-runtime-bumps-20261013` (pushed; its commits are in the rebuild branch and PR #63): electron 43.5.1, nodemailer 10.0.13,
  imapflow 1.7.8, brace-expansion, ip-address, capacitor-swift-pm 8.5.0. 24 alerts clear by range check; Dependabot closes them only after main.
- Branch `claude/desktop-next-20261013`: `desktop-next/` import (Hermes 6e7b83a2f1), lockfile, vendored scripts, mock launcher, telemetry removal (a2f303d4).
  Builds and runs in Electron against Hermes's mock backend with a temp HERMES_HOME.
- Uncommitted in the desktop-next worktree (designer, stopped by owner, unreviewed): Vanta theme preset as default; a codemod raising text under 12px to 12px
  across about 210 files; five uppercase-label removals. Isolate before any commit.
- Stash `warm token migration (superseded)` in the rebuild worktree: warm-palette CSS pass, rejected by the owner; kept, not deleted.
- Packaged proof of the rebuild candidate: ASAR a37d3868...; the 79-check chat-first proof is intermittent on this host for the baseline too
  (baseline 2 of 4 passes, candidate 2 of 6); not certified. Installed app unchanged (e7016146...).
- Hermes install updated to 6e7b83a2f1 after clearing a stale `.hermes-update-in-progress` lock (state.db backed up three times).
- REA 6.4.0 configured for Claude Code and Codex (backups `~/.claude.json.rea.backup`, `~/.codex/config.toml.rea.backup`); private repo `jpoindexter/rea`.
  REA output for the ChatGPT/Codex app exists in scratchpad and is not used for code.

## 9. Open decisions (owner)

1. Launch screen: reopen last chat (recommended) or Home.
2. Workbench default tab: last used, Changes, or Outputs by task type.
3. Session tabs in the titlebar: drop (recommended) or allow when pinned side by side.
4. Do monitors appear in the session list or only under Schedules.
5. Mini window and tray: same session, read-only until focused, or full composer.
6. Shell "Always allow": project-wide (current), or per-command-prefix grants (recommended, upstream pattern from Codex exec policy).
7. Project-scoped Always outranks an unscoped Never for the same tool (current specificity rule); keep or invert.
8. Rework current app instead: acceptance would be to port tokens/primitives only; not recommended (see D1).

## 10. Risks

Transport mismatch (WS JSON-RPC vs HTTP/SSE); lossy events; singleton server state; 405 on PUT/PATCH/DELETE under the boundary token;
about 150 bridge members; Hermes scroll behavior vs the no-forced-auto-scroll strategy (unverified); proof scripts pinned to old selectors;
unreviewed codemod; protected-path edits (kernel, factory) need separate authorization; REA/Codex boundary.

## 11. Verification plan

Per slice: narrow vitest on touched dirs, renderer typecheck, real-Electron script for the slice outcome (like the approval persistence proof),
screenshots light/dark at 3 widths, keyboard traversal script, VoiceOver names, then once at the integration point the packaged candidate
(`desktop:pack`), hash and signature, existing proofs that still apply, installed-copy check through the guarded installer. Measure flake rate
(3+ runs, candidate vs baseline) before claiming a green proof.

## 12. Linked files in this folder

`DESIGN-VANTA.md` design contract and tokens; `design-facts-2026-10-13.md` measured Codex facts (Claude chat UI is remote, not measured);
`hermes-feature-matrix-2026-10-13.md` about 85 features with verdicts, slices, bridge list; `wireframe/vanta-desktop-wireframe.html` clickable wireframe
(also published as an Artifact); `security-triage-2026-10-13.md`; repo docs `docs/upstream-adoption-matrix-2026-10-13.md`,
`docs/approval-persistence-2026-10-13.md`, `docs/dependency-runtime-bumps-2026-10-13.md`, `docs/execution-log-2026-10-13.md`.
