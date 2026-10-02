# Conversation workbench — 2026-10-02

## Active outcome

Jason's supplied Codex screenshots are interaction references for the whole workflow: conversation, context, ongoing work, decisions, results, background activity and resumption. White/grey with Vanta violet is the default; dark is optional. The mini/avatar opens the same workspace rather than a second agent. See the [full workflow contract](desktop-ambient-workflow-2026-10-02.md). This is a structural redesign, not a claim of Codex source reuse or feature parity.

## Earlier October 2 checkpoint (superseded by the latest evidence below)

- Target: isolated `codex/desktop-chat-workbench-20261002`, based on `ab5e8910f2d474ed3e84772bf2262893b9962b5e`.
- Preserve: original dirty Desktop checkout, recoverable prior installed bundles, canonical planning checkout and all other worktrees.
- Imported: unfinished chat-first source and the approval-persistence changes from `12bc974c0383157abcd943f0c129e1fe9c63ef89`, excluding its instruction-file change. Port draft persistence and session targeting into the split handlers.
- Now: signed chat-first replacement installed at `/Applications/Vanta.app`; 46 exact-installed fixture interactions passed. Full product recovery is the outcome, not a demo-only slice.
- Next: live browser research to document and bounded native-app observe/act/verify when the Mac is unlocked, then remaining scoped recovery cards. Dependency remediation integration remains open.
- Later: unfamiliar-person beta proof remains deferred. No paid workflows, service purchases, release, main push or protected-source changes.
- Done evidence: packaged chat/send/queue/stop/restart, approval behavior, project navigation and document pane interaction; readable responsive screenshots; no lost draft; no accidental submission or private-file read.

## Boundaries

No roadmap cards are cleared by source integration alone. The 18-card recovery board remains the execution scope; this Desktop priority does not silently discard its other work. No source or branding from Hermes/Codex is copied in this slice. Dependency and human acceptance gaps remain open.

## Owner priority and observable behavior

The interview has no scheduled date. Prioritize usable, repeatable workflows rather than marking an entire backlog complete: normal chat and draft continuity; remembered routine permissions; research to a document; bounded computer/app control with visible progress and stop.

The packaged candidate opens New chat directly into a focused, empty composer without a task/host/Git/worktree form or provider request. The advanced project-task entry remains separate. Document tabs offer read-only Markdown/source previews beside chat without attaching or sending the file. Private paths and oversized or non-text files are rejected.

Two reproduced permission regressions were addressed after failing tests: an earlier tool-wide rule shadowed the appended Always/Never preference, and CLI persistence failures were swallowed. Saving now replaces only the exact tool-wide preference, retains narrower restrictions and kernel blocks, and surfaces failure without approving the action. Both Desktop approval surfaces expose the same scoped choices and keep storage errors visible until dismissed. Matching ordinary inner requests use the original exact tool/action descriptor; explicit fresh requests and changed targets remain fresh. Desktop terminal commands use the shared policy and retain durable effect receipts. These changes do not make fresh consequential approvals reusable or bypass kernel checks.

## Earlier executed local evidence — superseded package

All commands below exited 0 in this execution checkout. Commands are relative to `vanta-ts/` unless noted.

| Gate | Command / evidence | Result |
| --- | --- | --- |
| Full TypeScript suite | `npm test -- --reporter=dot` | 1,583 files; 14,404 passed, 3 skipped; exact installed candidate source |
| Focused Desktop and approval paths | `node_modules/.bin/vitest run desktop-app/src src/desktop src/permissions src/ui/approval-persistence.test.tsx src/ui/approval-prompt.test.tsx src/ui/grant.test.ts src/ui/task-approval.test.ts src/agent/permission-gate.test.ts src/effects/tool-effect-gateway.test.ts` | 121 files; 810 passed before behavior-equivalent focus-hook extraction; subsequent full suite and exact installed replay cover extraction |
| Typechecks | Runtime and Desktop renderer configured typechecks | Both passed |
| Production renderer | `npm run desktop:build` | Passed; large-chunk warning remains |
| Package | `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir --arm64 -c.mac.identity=null -c.mac.notarize=false`; then `@electron/osx-sign` with exact existing certificate and hardened-runtime entitlements | Signed locally; installed with rollback; `codesign --verify --deep --strict /Applications/Vanta.app` passed; no notarization or publication |
| Packaged interactions | `VANTA_DESKTOP_APP=/Applications/Vanta.app/Contents/MacOS/Vanta node scripts/desktop-chat-first-proof.mjs` | 46 checks; zero renderer errors; includes remembered approval across restart/new chat, save failure, blocked turn and composer focus |
| Changed new production modules | Repository size lint: 11 new Desktop modules and 2 permission modules | Passed; not a whole-tree debt claim |
| Secret scan | Repository root `bash scripts/secret-scan` | 2,180 commits plus tracked/non-ignored snapshot; zero findings |
| Scoped static security | Semgrep, changed approval/agent/effect modules | 89 rules on 10 files; zero findings; not a dependency audit |
| Roadmap projections | Canonical planning checkout generators, projection check, build-order/projection tests | 7 tests passed; schema/dependency/cycle checks clean |
| Whitespace | `git diff --check` | Passed |

Installed app archive SHA-256: `0628a4d7ee3001775bdc81745be3f2e1db267b4627a58841b85d7ac65d7efdeb`. Evidence: `vanta-ts/.artifacts/chat-first-proof/result.json`, `01-new-chat.png`, and `workbench-document-dark.png`. The proof uses the real installed Electron package, disposable state and local kernel, but a synthetic model provider; the native folder selection is simulated through IPC. Host diagnostics include Git errors from the disposable non-Git project. This is not a clean-host-log or live-account proof. A later source-only CLI doctor wording correction passed 38 focused tests and runtime typecheck; it is not included in this installed hash.

The original Desktop checkout's 76 recorded file hashes and complete status were rechecked unchanged. No protected Rust, factory or MANIFESTO source was changed. No Rust tests were rerun for this slice.

## Source-grounded interaction reference

Reviewed selected Block Buzz source at `639593bba97b4ed1386d5128bceecfab2072df31`: `desktop/src/app/routes/messages.new.tsx`, portions of `features/messages/ui/NewMessageScreen.tsx` and `MessageComposer.tsx`, and `features/projects/ui/ProjectConversationPanel.tsx`. Relevant patterns are conversation-shaped creation, first-send creation with visible errors, per-conversation drafts and an independent conversation side panel. This was a bounded source review, not an exhaustive repository audit; no Buzz source, engine, branding or protocol was copied.

## Earlier acceptance gaps / re-entry — historical checkpoint

- Installed Desktop was replaced with rollback and exact-path proof. Current-build normal-profile/live-provider native interaction awaits Mac unlock. The preceding normal-profile run showed New chat; do not promote that to current-build live workflow success.
- “Don't ask again” now has actual store/gate and Ink regression evidence, but no fresh installed CLI cross-task replay. Separate browser/computer inner-action prompts remain and need scoped authority work, not a blanket bypass.
- Native-control doctor checks helper availability, not actual macOS permission or observe/act success; a source-only follow-up now states that boundary instead of claiming READY. The real research attempt failed on source HTTP 403 and exposed forced continuation; that regression is fixed in the installed build, but a successful research/document and native-app workflow remains unverified.
- Full project identity/runtime switching, simultaneous-chat navigation, embedded browser, complete transcript behavior and assistive-technology acceptance remain open. Chat navigation while streaming is currently unavailable.
- Dependency-security integration, remaining recovery cards and unfamiliar-person beta remain open. No commit, push, release or deployment occurred. Local installation is executed, not publication.

Re-entry: unlock the Mac; resume the disposable installed-app live run described in `interview-demo-2026-10-02.md`; prove public research → cited document → readback and bounded observe → approved action → verify → stop. Continue browser/project and dependency-ready recovery work. Keep whole-card closure dependent on the complete acceptance contract.

## Latest evidence and re-entry

The historical tables above describe an earlier package, not the current state.
The [ambient workflow record](desktop-ambient-workflow-2026-10-02.md#executed-october-2-checkpoint)
contains the latest exact archive, commands, counts, source-review limits and
remaining gates. In particular, the new package has 51 interaction checks and
14,445 passing TypeScript tests; normal-profile mini/avatar/draft retention was
observed before the latest permission-visibility/shortcut fixes. A later native
attempt reported a locked Mac. The real CLI research success does not complete
Desktop computer-control acceptance. No current security-green, size-green,
whole-workflow completion, merge or release claim is made.
