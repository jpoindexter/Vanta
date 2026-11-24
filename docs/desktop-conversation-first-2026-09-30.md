# Conversation-first Desktop continuation — 2026-09-30

Historical evidence. The [October 2 application checkpoint](development-checkpoint-2026-10-02.md)
supersedes this snapshot's publication and installation status.

Status: this UI slice passes local packaged verification; not installed, released
or published. The full integrated replacement remains incomplete.

## Outcome and scope

Make the everyday path open → new/resumed chat → request → visible work → result
feel like a familiar conversation application. Preserve Vanta's broader agent
capabilities and approval contracts. This does not make unsupported actions
available or grant new authority.

Continues the existing dirty `codex/desktop-replacement-20260908` worktree at
`ab5e8910f2d474ed3e84772bf2262893b9962b5e`. Before editing, tracked binary diff,
untracked files and status were saved outside the repository. No installed-app,
operator-state, protected-source or dependency-security-branch changes belong to
this pass. GitHub Actions remains disabled.

## Changes

- Chat history now occupies the sidebar directly below New chat and search.
- Six existing utility routes are preserved under Tools & activity, initially
  collapsed. Keyboard Enter opens it; Escape closes it and restores focus.
- Every utility screen has Back to chat, preserving the current session/draft.
- Three general-purpose starters prepare editable document, research or idea
  prompts. They never send automatically and disappear while a draft exists.
- A packaged test exposed a lingering sidebar preview consuming Escape before
  the compact model dialog. The preview now yields Escape to every shell dialog,
  including compact dialogs without `aria-modal`; regression coverage added.
- Existing queue, attachment, model, approval, context and Classic paths remain.

## Reference code actually inspected

No upstream source, dependency or checkout was copied into Vanta.

- T3 Code `c2fa9fc911daeac97df4760f95fc57dca42b84c8`:
  [SidebarChrome.tsx](https://github.com/pingdotgg/t3code/blob/c2fa9fc911daeac97df4760f95fc57dca42b84c8/apps/web/src/components/sidebar/SidebarChrome.tsx)
  separates thread navigation from utility controls and provides return navigation.
  [ComposerSurface.tsx](https://github.com/pingdotgg/t3code/blob/c2fa9fc911daeac97df4760f95fc57dca42b84c8/apps/web/src/components/chat/ComposerSurface.tsx)
  keeps a width-constrained composer with contextual attachments. These are
  interaction references, not evidence that Vanta has T3 Code feature parity.
- Codex App Server README inspected live from the public repository: its
  persistence and authority contracts are runtime references, not a copyable
  Codex Desktop renderer. Prior pinned Codex/Hermes source decisions remain in
  `desktop-full-rebuild-execution-2026-09-08.md`.

## Verification

Current commands and final results are recorded below after execution. The
packaged proof runs the real Electron renderer, preload, local API, kernel and
stores with disposable state and a synthetic loopback model. It cannot prove
live provider/account behavior, unattended autonomy or human comprehension.

| Executed gate (from `vanta-ts/`) | Exit | Result |
| --- | ---: | --- |
| `npm run typecheck` | 0 | Runtime typecheck |
| `npm run desktop:renderer:typecheck` | 0 | Renderer typecheck |
| `node_modules/.bin/vitest run desktop-app/src` | 0 | Final source: 52 files, 181 tests passed |
| Isolated `npm test` with temporary `VANTA_HOME` | 0 | 1,572 files, 14,334 passed, 3 skipped; ran before the final preview-Escape fix. Final focused suite above includes that fix and its 3 additional tests. |
| `npm run desktop:build` | 0 | Production renderer; inherited 500 kB bundle advisory remains |
| `CSC_IDENTITY_AUTO_DISCOVERY=false node_modules/.bin/electron-builder --mac dir --arm64 --publish never` | 0 | Local unsigned ARM64 candidate; Electron runtime downloaded; no notarization or publication |
| `node scripts/desktop-chat-first-proof.mjs` | 0 | Final candidate: 40 scenarios, 18 synthetic provider requests, zero uncaught renderer errors |
| `runLint` over the six changed production TypeScript modules | 0 | All within file/function/parameter/complexity limits |
| `git diff --check` | 0 | No tracked whitespace errors |
| Root `./scripts/secret-scan` | 0 | 2,180 commits plus tracked/non-ignored snapshot; zero findings |

The two earlier package replays failed on model-picker Escape. Their logs were
retained; the final replay passed that unchanged dismissal assertion after the
preview ownership correction. No acceptance assertion was removed.

Packaged checks cover utility return with draft preservation, starter preparation
without a provider call, send/stream/stop, queue editing/reordering/steering,
explicit retry, chat ownership, restart, narrow/light layouts, accessibility scans,
file replay provenance, and local one-use approval. Native folder selection in
this run is simulated at the OS picker boundary, while IPC and host restart are
real. Do not restate it as a fresh real native-picker or VoiceOver run.

Final ASAR SHA-256:
`1b659d9608d7304ad101ab6bff75de415eb776ab0a5fb0a65a05d31e2f26a1d4`.
Proof receipt (`.artifacts/chat-first-proof/result.json`) SHA-256:
`2a3da5736254af88162f63961d96dc7107afc4dec70aa7d6c359f220592b5979`.
Screenshot (`.artifacts/chat-first-proof/entry-conversation-first.png`) SHA-256:
`bc96927611d6fa851a1060da2bb61c4eed1de0c0aee5bffefbdfa7828ddea782`.

The final candidate retains harmless-to-this-proof non-Git project probe
diagnostics. No completely silent runtime, security-audit clearance for this
older dependency stack, or performance comparison is claimed.

## Remaining delivery gates

1. Reconcile this earlier rebuild with the newer approval-persistence fix and
   dependency-security work. Do not replace the installed app with this older
   runtime stack or claim its dependencies are audit-clean.
2. Execute the combined package's live-provider path and native accessibility
   checks. Human beta acceptance remains deferred at the owner's request.
3. Review and authorize installed-app cutover with a recoverable backup. Source
   and candidate changes are not a change to the app currently in Applications.

No roadmap card is promoted by this pass. No commit, push, tag, merge, release,
deployment, notarization, new paid service or GitHub workflow is performed.
