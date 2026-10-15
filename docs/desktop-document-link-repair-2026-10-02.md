# Desktop research result and document-link repair — October 2, 2026

This is a development follow-up to source checkpoint
`c272e25d0cef1ee15f55c4a491fb12abfb54a350`, not a release or full ambient-workflow acceptance.

## Earlier normal installed application: executed evidence

The installed archive was rehashed as
`fb31b7ff1119039a491bdadb88f00438a67d47aa37cc18e0365f7ad8d1ac9539`.
The checks below used its normal profile and actual connected Codex provider,
not the disposable fixture provider.

- New chat opened a composer without a task-creation contract. An existing
  unsent draft was retained; it was not submitted as a test prompt.
- A bounded no-tools prompt received the exact requested response:
  “Vanta desktop is responding.”
- The visible Codex catalog included `gpt-6.1-sol` and `gpt-6-astra`. This was
  catalog observation, not an execution test of every listed model.
- A separate bounded prompt fetched the public MDN native-dialog and ARIA-dialog
  pages, wrote an original cited brief, and read it back. Eight tool calls were
  visible. The sole created file was the previously absent, Git-ignored
  `vanta-ts/.artifacts/desktop-acceptance-2026-10-02/research.md` in the current
  project. Independent filesystem readback found 1,300 bytes and 163 whitespace
  words; the agent's own answer said 167 words, so its count is not the measurement.
- The brief's SHA-256 was
  `5a689c67c34b7f9b799ed35248d5eeed7818630dff83b52aa7673264436e730e`.
  It contained both exact requested source links. No account interaction,
  schedule, dependency installation or paid search was requested.
- During this real turn, Mini Vanta retained the live conversation, visible
  Stop/queue controls and a deliberately unsent acceptance draft. Expanding
  after completion retained the same draft and result.

These observations establish real Desktop → provider → public research → local
file → readback. They do **not** establish native computer control, all model
compatibility, or a finished research-to-document interface.

## Reproduced defect and bounded repair

Clicking the returned `research.md` link did not open the workbench. Its anchor
was rendered inert: the Markdown component allowed web/file schemes but treated
ordinary project-relative and absolute file paths as unsafe. The transcript also
had no connection to the existing read-only preview panel.

The repair adds explicit, project-bound document routing. Chat-result links reuse
the existing preview API, rather than navigating a raw `file:` URL or starting an
OS action. Traversal, out-of-project paths and non-web schemes remain inert.
The server still enforces private-file filtering, real-path containment, no
symlinks, supported text types and the 256 KiB limit. Missing or refused files
show the preview's existing error/retry state; no attachment is silently added.

From Mini Vanta, a result requests expansion of the same window, then opens its
document alongside the originating chat. Pending links are discarded if project
identity changes or expansion fails. Document-body relative-link resolution is
not added in this slice; existing HTTP source links remain external links.

Regression tests first reproduced the disabled result link. Additional tests
cover pointer dispatch, escaped paths, unsafe targets, preview rejection,
mini/full handoff, retained drafts and changed-project cancellation. The packaged
proof adds pointer and keyboard links, mini expansion and a missing-file case,
with synthetic provider prose explicitly separated from real Electron/API/file
behavior.

## Executed repair gates

Commands run in `vanta-ts/` unless marked root. All exits below were 0.

| Gate / command | Observed result | Evidence limit |
| --- | --- | --- |
| `npm run typecheck` | Runtime typecheck passed | Does not execute the renderer |
| `npm run desktop:renderer:typecheck` | Renderer typecheck passed | Does not prove native input |
| `npx vitest run desktop-app/src src/desktop/file-preview.test.ts src/desktop/file-context.test.ts src/desktop/files-routes.test.ts` | 62 files, 253 passed | Component/server tests, not operator-profile proof |
| `npx vitest run --reporter=dot` | 1,592 files, 14,486 passed, 3 skipped | Optional LoRA/Whisper integrations remain unexecuted |
| Explicit `npx tsx src/cli.ts lint` on the six changed production renderer files | 6 files, zero violations | The analyzer does not measure `.mjs` proof scripts |
| `node scripts/check-boundaries.mjs` (root) | All 5 boundaries passed | Static architectural checks |
| `npm run desktop:pack` | Production renderer and signed macOS package passed | Packaging alone is not installation or notarization; subsequent installation is recorded below |
| `codesign --verify --deep --strict --verbose=2 release/mac-arm64/Vanta.app` | Valid on disk; designated requirement satisfied | Signature does not establish usability |
| `node scripts/desktop-chat-first-proof.mjs` | 54 checks passed, zero renderer errors | Disposable profile and synthetic provider; real packaged UI, local kernel, API and project files |
| Semgrep `p/security-audit --metrics=off --error` on the six changed production renderer files | 22 rules executed, 225 loaded, zero findings | Not a dependency or whole-repository security certification |
| `bash scripts/secret-scan` (root) | 2,182 historical commits and tracked/non-ignored snapshot; zero findings | Ignored operator state, dependencies and package output are excluded |
| Protected-path diff and `git diff --check` (root) | No protected Rust/factory/MANIFESTO changes; no whitespace errors | Scoped follow-up only |

The six production files are `message-markdown.tsx`, `document-link.ts`,
`document-link-context.ts`, `chat-first-document-links.tsx`, `chat-first-shell.tsx`
and `desktop-surface.ts`. Regression coverage added 35 tests across three files.
The packaged check added three interaction cases to the previous 51.

The exact candidate archive SHA-256 is
`8dd23904ce84e44dc7841c9d849ee6a7c90f45f13014238a02995c1e658ebde3`.
The guarded update subsequently installed this exact archive, as recorded below.
Packaged proof artifacts are retained locally under
`vanta-ts/.artifacts/chat-first-proof/`, including `result.json` and the inspected
`document-link-from-mini.png`. They contain fixture content, not the operator's
conversation. The fixture's non-Git repository-probe diagnostics and the
production renderer's inherited large-chunk warning remain disclosed.

Rust, website deployment and live account integrations were not rerun for this
renderer-only follow-up. The earlier source checkpoint records their separate
evidence; none is implied by these new checks. GitHub Actions remains disabled.

## Guarded installation and normal-profile result: executed

`npm run desktop:rebuild` exited 0 and installed the exact `8dd23904…`
archive at `2026-10-02T18:54:11.754Z`. Its retained log is
`vanta-ts/.artifacts/document-link-installed-update.log`. The updater reran
both typechecks, seven installer tests, production packaging, Developer ID
signing/deep verification and all 54 packaged interactions with zero renderer
errors before replacement. Independent hashing of the installed archive
matched the full candidate SHA-256 above. The preceding `fb31b7ff…` package
and the machine-readable installation receipt remain in the local rollback
folder outside Git.

The earlier locked-screen observation was transient. The idle app was later
quit normally and reopened on the owner's existing profile; no forced
termination, shared-kernel restart or user-state reset was used. The research
conversation and deliberately unsent acceptance draft were retained.

In the normal installed full workspace, clicking the existing `research.md`
result opened the read-only document workbench alongside that conversation.
The native accessibility tree showed the document heading, brief and both MDN
source links, while the composer retained its unsent draft. This closes the
full-workspace result-link interaction gap for this exact installed package.
It does not imply a new live research turn on this package.

Mini Vanta opened with the same conversation and draft. A subsequent normal-
profile mini result-link attempt did not establish an observable expansion and
document-open result: native input targets became stale and the final observed
state was inconclusive. The disposable packaged mini-link test passed, but
that is not a substitute for this remaining normal-profile interaction proof.

## Remaining acceptance boundary

Whole-flow Connections/background/results coherence, bounded native-app action,
normal-profile approval persistence/denial/interruption, native assistive and
physical multi-monitor checks remain separate. Dependency remediation and
deferred unfamiliar-participant acceptance are also still open. No roadmap
acceptance status is promoted by this repair.
