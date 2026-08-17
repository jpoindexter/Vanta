# Vanta final consolidation audit — 2026-08-17

**Verdict:** locally green for the proposed Vanta-only consolidation. This is a review checkpoint, not a release, deployment, merge, live-account proof, or external-user result.

## Repository boundary and topology

| Item | Verified value |
|---|---|
| Repository | `jpoindexter/Vanta` |
| Base | `origin/main` at `4911ae44bbb35beef4511ba298475ba5a82b7e1c` |
| Branch | `codex/vanta-final-consolidation-20260817` |
| Prior stack head | `58a6f0be2b85c9af103703a92ef2734ae5856d00` |
| Consolidation commit | `adadf2c847e9f0f90f4a0f593dd52387961051eb` |
| Divergence before publication | 0 behind / 72 ahead of `origin/main` |
| Consolidation diff | 123 files; 2,399 insertions; 872 deletions |
| Full branch diff | 845 files; 60,827 insertions; 7,068 deletions |
| Worktree after commit | clean |

No push to `main`, force-push, merge, release, deployment, notarization, or paid workflow occurred during this audit. GitHub Actions remained disabled.

## Preserved user work

Four other checkouts were treated as user-owned and left unchanged. Before reconciliation, their tracked diffs, untracked archives, statuses, branch/HEAD records, and SHA-256 manifests were written to the private packet at `Desktop/vanta audit/final-consolidation-20260817`.

The largest unpublished correction checkout is also preserved by the local recovery ref `recovery/correction-unpublished-20260817` at commit `66a427f105fb2ada6e7b2467a9242ef6090fb91a`. Its reconstructed tree matched the source checkout with zero path or byte mismatches. The recovery ref and private packet were not pushed.

## Consolidated behavior

- Repaired assistant tool-call adjacency and deterministic settlement, including early exits and damaged saved transcripts.
- Added a synthetic, content-free regression fixture; no private transcript was committed.
- Made long TUI pastes compact while keeping text typed after the paste visible and preserving exact submitted bytes.
- Made queued TUI messages visible, bounded, editable, and reachable from the empty composer.
- Added capability-driven model, effort, and speed controls to Desktop and TUI. Unsupported controls stay hidden.
- Changed the active-provider model action to a compact settings popover; the provider browser is an explicit second step.
- Implemented Anthropic fast-mode request headers only for supported models. This follows Anthropic's documented `speed: "fast"` contract and does not claim a live paid request.
- Kept Claude subscription authentication on the official Claude Code client path. A recovered hard-coded third-party OAuth client flow was rejected and removed.
- Kept `/setup telegram`, `fix telegram`, and `repair telegram` inside the TUI as status actions. Secret entry remains an explicit shell wizard.
- Preserved Desktop pasted text and attachments after a failed send, without overwriting text typed while the request was in flight.
- Regenerated the Desktop production assets, provider catalogs, build-order projection, documentation, and 42 visual baselines.

Official references used for the provider boundary: [Anthropic fast mode](https://platform.claude.com/docs/en/build-with-claude/fast-mode), [Claude Code getting started](https://docs.anthropic.com/en/docs/claude-code/getting-started), and [Claude subscription authentication](https://support.anthropic.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan).

## Executed gates

| Gate | Command | Exit | Observed result |
|---|---|---:|---|
| Runtime typecheck | `npm run typecheck` | 0 | TypeScript clean |
| Renderer typecheck | `npm run desktop:renderer:typecheck` | 0 | Desktop TypeScript clean |
| TypeScript 7 compatibility | `npm run typescript:compat:test` | 0 | 1/1 passed |
| Startup compile | `npm run startup:compile` | 0 | launcher imports compiled |
| Full TypeScript suite | `npm test` | 0 | 1,536 files; 14,158 passed; 3 skipped; 0 failed |
| Rust suite | `cargo test` | 0 | 70 passed; 0 failed |
| Website typecheck/build | `npm run typecheck && npm run build` | 0 | static production build passed |
| Visual proof | `npm run desktop:visual:proof` | 0 | 42/42 exact captures; 3/3 mutation/tolerance tests |
| Final package | `npm run desktop:pack` | 0 | `.app` built; code-signature verification passed |
| Packaged AnyDoc | `node scripts/anydoc-packaged-smoke.mjs` | 0 | native local conversion passed |
| Packaged model settings | `VANTA_DESKTOP_APP=... node scripts/desktop-model-settings-smoke.mjs` | 0 | Codex model/effort/speed; Claude effort; unsupported hidden; keyboard/layout passed |
| Packaged queue | `VANTA_DESKTOP_APP=... node scripts/desktop-queued-turn-editor-smoke.mjs` | 0 | enqueue/edit/reorder/steer/remove/retry/restart passed |
| Packaged paste | `VANTA_DESKTOP_APP=... node scripts/desktop-clipboard-paste-smoke.mjs` | 0 | mixed paste, dedupe, remove, failure preservation, success clearing passed |
| Packaged operator flow | `VANTA_DESKTOP_APP=... node scripts/desktop-operator-flows-smoke.mjs` | 0 | Work, compact model picker, Telegram, queue, MCP, Google, recovery, settings passed |
| Build-order generator | `node scripts/build-order.mjs` | 0 | 7 open cards rendered |
| Build-order test | `node --test scripts/build-order.test.mjs` | 0 | 1/1 passed |
| Validator mutations | `node --test docs/strategy-realignment-validator-mutations.test.mjs` | 0 | 7/7 passed |
| Roadmap aggregate | schema + dependency/cycle check from `vanta-ts` | 0 | 1,331 unique; 0 missing; 0 self; 0 cycles |
| Runtime npm audit | `npm audit --omit=dev` | 0 | 0 vulnerabilities |
| RustSec | `cargo audit` | 0 | 0 vulnerabilities |
| Secrets | `./scripts/secret-scan` | 0 | 3,015 commits and current tracked/non-ignored snapshot; 0 findings |
| SAST | Semgrep security + secrets rules over changed source | 0 | 61 files; 61 rules; 0 findings |
| Protected paths | staged-path guard | 0 | 0 Rust kernel, protected factory, Cargo, or `MANIFESTO.md` paths |
| Forbidden additions | staged path/content guard | 0 | 0 Hermes, Nightcode, local `.vanta`, or quarantine additions |
| Whitespace | `git diff --cached --check` | 0 | no findings |
| Real launcher | `vanta` in a real PTY | 0 | no repeated setup; Telegram stayed open; compact model picker; 14-line paste plus visible suffix |

## Roadmap result

Canonical `roadmap.json` contains 1,331 unique records:

- 1,286 shipped
- 38 parked
- 1 next: `GROW-01`
- 6 horizon

There are no duplicate IDs, missing dependencies, self-dependencies, or cycles. Generated build-order and website projections were produced from canonical JSON rather than hand-edited. No card status was promoted by this consolidation.

## Security and GitHub state

- GitHub Actions: disabled.
- Main classic protection: force pushes disabled; deletion disabled; linear history required; conversations required to resolve; one approving review required; last-push approval required.
- Repository rulesets: none; classic branch protection is the active mechanism.
- Two existing draft PRs remained open and unchanged during local consolidation.
- Complete Git history and repository-owned snapshot secret scans found no leaks.
- No credential, private transcript, Hermes checkout/source, Nightcode content, `.vanta` state, recovery archive, or quarantine artifact is in the consolidation commit.

## Packaged artifact hashes

| Artifact | SHA-256 |
|---|---|
| `Vanta.app/Contents/MacOS/Vanta` | `8618703399046a304166047e7654d2ff3e4c059c42ad9e004abc80541d7461e3` |
| `Vanta.app/Contents/Resources/app.asar` | `98e8da3e7a5d6e2d7e90dd71099623f7f6a80bc069f8dd4bd0f0e7f810b6ab3c` |
| Packaged AnyDoc native module | `c52d087d176d6740f225c5c87f69801043de2ad745827dd06bfc8fcc7a0a3de2` |

## Failed checks that were closed

1. The Desktop clipboard smoke caught failed sends clearing the draft. The implementation now restores only into an empty composer, preserves a newer draft, and passes the source and packaged smoke.
2. The operator smoke expected the retired full-screen model dialog. Its acceptance path now proves the compact active-provider popover before explicitly browsing providers.
3. The operator smoke also expected a Telegram question to open setup. It now proves questions reach the model while direct repair instructions open local status.
4. An aggregate roadmap command was launched once from the dependency-free root and could not load `tsx`; the same read-only check passed from the documented `vanta-ts` dependency root.
5. An initial Semgrep invocation included a stale generated bundle name; the corrected source-only scan covered 61 changed source files and returned zero findings.

## Honest remaining gaps

- The existing size gate remains red at 51 findings. The comparable baseline has the same 51 findings; newly added modules do not increase the count. This is inherited refactoring debt, not a green repository-wide size claim.
- The website build toolchain contains `image-size@2.0.2`, reported as one package with two high-severity denial-of-service advisories and expanded by npm to 19 affected dependency nodes. Docusaurus 3.10.2 and `image-size` 2.0.2 are current, no patched version exists, and npm's proposed force-fix is a breaking search-plugin downgrade. The path is limited to the local static build reading repository-owned images.
- No live provider request, paid fast-mode request, external account, participant test, release, deployment, notarization, or merge was executed. Those outcomes are not implied by local gates.
- The full stacked PR is large (845 files from `main`) and still requires human review. Local green does not replace review or merge authorization.

## Claim ledger

- **Executed:** local tests, final packaged application smokes, real TUI launcher interaction, roadmap checks, local builds, scans, GitHub protection inspection.
- **Code-path only:** Anthropic fast mode and provider subscription routing; wire shape is tested but no live paid request was sent.
- **External/unknown:** participant acceptance, live third-party accounts, distribution, deployment, release, and merge.
