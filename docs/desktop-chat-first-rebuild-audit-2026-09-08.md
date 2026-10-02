# Vanta Desktop chat-first rebuild — local candidate

Date: 2026-09-08. Verdict: **locally validated primary-shell candidate; not a release or complete Desktop migration**.

Historical primary-shell snapshot. The continuation, current package hashes and
remaining screen-reader acceptance gate are recorded in
[Desktop full rebuild execution](desktop-full-rebuild-execution-2026-09-08.md).
The artifact directory now holds the newer 34-scenario receipt, real native picker
and separate zero-pointer keyboard proof; the older hashes
and counts below do not identify the current candidate.

## Outcome and boundary

The new default Desktop shell is conversation-first, uses Vanta's black/bone/violet
design system, and keeps the existing Vanta runtime, providers, authority checks
and canonical stores. No upstream renderer or engine source was copied.

New chat no longer opens a project/task setup form. The new shell has chat
search/pinning/rename/archive/restore, hover and keyboard previews, compact model
controls, full queued-message text with edit/remove, and Files/Web sources/Activity
context. Today, Outputs, Schedules, Skills & tools, Connections and Settings reuse
existing components and APIs. New project task uses the native folder bridge and
creates a draft; it does not execute a model or claim that a worktree was created.

Classic view is retained for advanced workflow replay, the run library, detailed
inspectors and other existing workbench surfaces. There is one engine and one
canonical session/queue store, not a parallel product behind the new appearance.

## Git and checkout boundary

| Item | Before | After |
| --- | --- | --- |
| Implementation branch | New isolated `codex/desktop-replacement-20260908` | Same branch; changes remain uncommitted |
| HEAD | `ab5e8910f2d474ed3e84772bf2262893b9962b5e` | Unchanged |
| Implementation worktree | Clean | Rebuild, tests, generated renderer and this audit only |
| Installed checkout HEAD | `4cb3dae364988bf09cbea91871b8cf22a2ddc3fa` | Unchanged; not replaced |
| Installed checkout status | Earlier check was clean | Three unrelated untracked scripts observed at final check; untouched |
| Roadmap worktree | Separate, already dirty | Preserved at 1,361 records; 21 status entries observed |
| Git publication | None authorized | No commit, push, tag, merge or release |

Implementation directory: `docs/Vanta-desktop-replacement-20260908` beside the
other full checkouts. The `_active/Vanta` directory containing the wireframe is a
partial snapshot and was not used as a build checkout.

The three unrelated installed-checkout entries are `scripts/keypaste.c`,
`scripts/prepare-lisbon-map.py`, and `scripts/unitype.c`. Their contents were not
needed or inspected. Do not clean them up as part of this rebuild.

The target's 1,341-record roadmap passes schema, duplicate, missing/self-dependency
and cycle validation. It is older than the separately reconciled 1,361-record
roadmap; it must not be used to overwrite that work. No roadmap status or generated
public roadmap was changed by this implementation.

## Module inventory

Paths below are relative to `vanta-ts/desktop-app/src/` unless noted.

| Module | Responsibility |
| --- | --- |
| `main.tsx` | Select chat-first default; retain `?shell=classic` and companion routing |
| `chat-first-shell.tsx` | Application layout, native-chrome space, shortcuts, runtime/error boundary |
| `chat-first-state.ts` | Compose existing hooks and guarded startup; no new session store |
| `chat-first-actions.ts` | Session-safe navigation, existing submit/queue/task/setup actions |
| `chat-first-navigation.ts` | Deterministic grouping/title and stale-recovery projection |
| `chat-first-sidebar.tsx`, `chat-first-row.tsx` | Chat navigation, preview and actions |
| `chat-first-conversation.tsx`, `chat-first-queue.tsx` | Existing transcript/composer plus visible editable queue |
| `chat-first-inspector.tsx`, `chat-first-workspaces.tsx` | Existing capability surfaces in the new hierarchy |
| `chat-first-overlays.tsx`, `chat-first-dialogs.ts` | Existing settings/approval/setup hooks; modal focus containment |
| `chat-first-project-dialog.tsx`, `chat-first-project-task.ts` | Honest create-draft flow and existing project handoff |
| `design/chat-first-*.css` | Three scoped stylesheets consuming Vanta tokens |
| Four `chat-first-*.test.ts[x]` files | 13 new deterministic/component tests |
| `vanta-ts/scripts/desktop-chat-first-proof.mjs` | Actual packaged-app interaction replay |
| `vanta-ts/scripts/lib/chat-first-provider-fixture.mjs` | Synthetic loopback streaming provider for that replay |
| `vanta-ts/src/cli/termux-install.test.ts` | Two-line fixture setup correction for isolated `VANTA_HOME` |
| `vanta-ts/desktop-app/dist/` | Generated renderer: three old assets replaced; index regenerated |
| Root `design.md` and this document | Locked direction, evidence and re-entry boundaries |

Protected Rust sources, Cargo files, protected factory source and `MANIFESTO.md`
are unchanged. Package manifests and lockfiles are unchanged. No credential,
operator state, foreign checkout, quarantine or unrelated source was added.

## Executed gates

Commands are from `vanta-ts/`, except the root secret scan and Rust tests.

| Gate / command | Exit | Observed result |
| --- | ---: | --- |
| `npm run typecheck` | 0 | Runtime TypeScript check passed |
| `npm run desktop:renderer:typecheck` | 0 | Renderer TypeScript check passed |
| `node_modules/.bin/vitest run desktop-app/src` | 0 | 40 files; 137 tests passed |
| `node --test scripts/lib/typescript-7-compat.node-test.mjs` | 0 | 1 compatibility test passed |
| `npm run desktop:host:test` | 0 | 14 Node host tests and 1 tray test passed |
| Final isolated `npm test` | 0 | 1,559 files; 14,288 passed, 3 skipped; 193.52 seconds |
| `cargo test` at repository root | 0 | 70 tests passed; Rust tree unchanged |
| `npm run desktop:build` | 0 | Production renderer built; 1,668 modules |
| `CSC_IDENTITY_AUTO_DISCOVERY=false node_modules/.bin/electron-builder --mac dir --arm64` | 0 | Local ARM64 app directory produced |
| `node scripts/desktop-chat-first-proof.mjs` | 0 | 17 packaged scenarios; 5 provider requests; zero uncaught renderer errors |
| `runLint('..', changedProductionFiles)` via `node --import tsx --input-type=module` | 0 | All 15 production files: <=300 lines, functions <=50, parameters <=4, complexity <=10 |
| `RoadmapSchema.parse(...)` plus ID/dependency DFS | 0 | 1,341 records; no duplicates, missing/self dependencies or cycles |
| `semgrep scan --config p/typescript --metrics off --error --json <15 changed production paths>` | 0 | 74 rules; zero findings |
| Root `./scripts/secret-scan` | 0 | 2,178 commits and repository-owned snapshot; zero findings |
| Protected/forbidden path inventory | 0 | No protected or foreign/state paths in proposed payload |
| `git diff --check` | 0 | No whitespace errors in tracked diff; new files checked separately |

The full-suite isolation preserves the original `HOME`, but strips other inherited
environment values and sets a disposable `VANTA_HOME`:

```sh
env -i PATH="$PATH" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" LANG=en_US.UTF-8 \
  VANTA_HOME="$(mktemp -d /tmp/vanta-rebuild-final-tests.XXXXXX)" \
  npm test > .artifacts/chat-first-proof/full-tests-final.log 2>&1
```

### Failures found and corrected during validation

- First packaging attempt used a symlinked dependency tree. The packager omitted
  a required runtime dependency (`esbuild`). An isolated APFS copy of the matching
  dependency tree fixed packaging; no dependency manifest was changed. The
  builder downloaded its Electron runtime. This was not an offline-only build.
- Packaged interaction checks exposed queue transcript refresh, stale recovery
  projection, modal focus and a dangling accessibility-control reference. Those
  renderer issues were corrected before the final 17-scenario replay.
- Initial full suite: 1,557 files passed and one failed; 14,284 tests passed, one
  failed, three skipped. A Termux fixture expected its temporary HOME directory
  to be created indirectly. The fixture now creates that directory explicitly.
- One subsequent test-only command accidentally omitted `HOME` entirely and
  failed the non-Termux diagnostic assertion. No product change was made for
  that command error. The corrected final isolated suite passed as shown above.

## Real-path proof and its limits

The replay launches the packaged Electron executable, the packaged Vanta runtime
and a real local kernel with disposable project/state/profile directories. Its
only substitute is the external model provider: a local deterministic HTTP
streaming fixture, not a mocked Desktop API or static screenshot.

Observed: New chat without setup; one sent reply persists; queue text is visible,
editable and removable during streaming; stop restores input; separate saved
chats retain distinct histories and drafts; one queued follow-up executes once
and appears in canonical history; compact picker keyboard focus stays inside;
sidebar preview/actions persist; no horizontal overflow at 760/1024/1440px;
restart restores a saved conversation and draft; five capability routes open;
light settings remain legible; archive/restore works; project-task creation stages
instructions without another provider request; Classic remains reachable.

Axe scans of exercised conversation/context/settings/width states found no
serious/critical violations. This does not establish complete accessibility,
screen-reader usability, live-account success or unfamiliar-person comprehension.
Opening preserved workspace routes is not proof of every integration behind them.

## Candidate and retained evidence

Candidate: `vanta-ts/release/mac-arm64/Vanta.app`.

Do not replace the installed app or run this candidate against operator state
as part of the automated proof. The checked-in replay supplies isolated state
and an allowlisted child environment with no provider credentials. It is safe to
rerun from this checkout to inspect the candidate's local synthetic-provider path.

`codesign -dv --verbose=2` shows a linker/ad-hoc executable signature, no Team ID
and no sealed resources. This is **not Developer ID signed, notarized or suitable
for external distribution**. No release/notarization workflow was used.

| Artifact | SHA-256 |
| --- | --- |
| `Vanta.app/Contents/Resources/app.asar` | `526922e4520ba0ad42630bb156f2e831b7b5ef94552812c7dcedc4e1295c2afb` |
| `Vanta.app/Contents/MacOS/Vanta` | `1af684f056a8eb13e49fbd677072e437316086b076e3b9b92de3ddb343edc5b1` |
| Embedded `kernel/vanta-kernel` | `98e6bb7c092b8d350ff65a998aa9f9ba83127f825f9c052c1cdd888223732e38` |
| `.artifacts/chat-first-proof/result.json` | `c1f38cd862b628ab69f5fadf2af5a8f3e999229cd85aa758df8e1e3acd2918ba` |
| `.artifacts/chat-first-proof/full-tests-final.log` | `7d2ba1382564ee9950c535ee7a6bf5c54e2411f1501c696b224d176141270d4b` |
| `.artifacts/chat-first-proof/03-visible-queue.png` | `ee9a98137281c7323eadb88d403ee3b4f85850d73fc0c33850013ff4189e77e2` |

The ignored proof directory contains 11 final screenshots, `result.json`, packaged
and full-suite logs, security reports, and the final proposed patch/file manifest.
Older failure captures are retained for diagnosis; they are not the final verdict.
The proposed patch includes new/untracked source, not only `git diff` output.

## Remaining work, in order

1. Review the actual candidate and handle never-sent draft discoverability. Saved
   conversations/drafts were exercised; opening a brand-new unsent draft after
   restart was not. The inherited session API does not list an empty session
   before its first turn; no second session store was introduced to hide that gap.
2. Execute real native folder/cross-project handoff and a fresh consequential-tool
   approval in the new shell. Host/component tests and existing authority hooks
   are evidence of plumbing, not those complete user paths. Then migrate the
   remaining Classic-only panels without widening tool authority.
3. With separate authorization, reconcile this branch into the newer roadmap
   stack, verify a live provider, perform human/VoiceOver beta checks, and decide
   installed-app cutover/publication. No automatic card promotion or publication.

Inherited diagnostics remain: harmless-to-this-replay non-Git-project probes print
`fatal: not a git repository`; a macOS Electron task-policy warning appeared on
one restart; Rust reports an unused import in untouched source. The renderer
bundle is 500.44 kB (145.33 kB gzip), just over Vite's 500 kB advisory threshold.
No dependency-audit clearance or completely silent runtime is claimed.

No paid GitHub Actions were enabled, dispatched or awaited. No live accounts,
credentials, protected implementation, installed application, Git history or
published tag was changed by this rebuild.
