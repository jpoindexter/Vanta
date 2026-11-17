# Agent delivery and preservation checkpoint — 17 November 2026

## Current delivery boundary

The verified agent source is [`19d68ed5`](https://github.com/jpoindexter/Vanta/commit/19d68ed5f145cbcdf82596ee3683dc00e339384d). The existing global CLI launcher now selects an independent runtime built from that exact committed source, after fresh owner approval. Its previous selection is retained for guarded rollback; the previous checkout, uncommitted files and running processes remain untouched. No credentials or approvals were migrated.

Before cutover, the actual unchanged launcher ran four isolated checks using its compiled runtime: empty fallback diagnosis, ordered fallback diagnosis including unavailable/unchecked entries, expired MCP authentication despite a healthy cached probe, and interrupted-child inspection. All passed their exact expected output/exit contracts. Guards observed zero network attempts, application-requested child launches, protected credential reads or writes outside the private fixtures. Existing fixture inputs and launcher bytes stayed unchanged. A private preinitialized Git marker excluded optional first-home Git setup; normal-profile inference, TUI behavior, live MCP and worker continuation were not tested.

Desktop **0.1.4** was built from clean `19d68ed5` using Node 22, Developer ID signed, and passed deep strict signature verification. The unchanged kernel source matched the installed build's source; its separately copied kernel bytes were hash-verified. No protected kernel or factory source was changed for delivery.

The actual packaged app passed seven core first-launch/restart criteria across three isolated launches: missing-provider setup, deferred-setup draft persistence, rejected-send recovery without inference, offline endpoint retry, explicit restore without automatic resending, one explicit send producing one synthetic-provider reply, and same-chat/draft persistence after restart. Zero renderer errors were observed. Paid output was mocked at loopback; the renderer, preload, IPC, API and bundled runtime were real.

**Not delivered:** Apple rejects the existing notarization profile with HTTP 401. No replacement key was created or revoked. No new notarized ZIP/DMG, updater release, normal-app installation or live help-site deployment is claimed. The normal installed Desktop remains the previously delivered **0.1.3 / `b2847a8f`**, with its rollback preserved. A signed local candidate is not a notarized public release.

**Cold typing is not yet established at whole-app level:** the attempted held session-open response found the editor already mounted from the owner-scoped cached tail. The harness rejected that proxy instead of calling it a pre-editor typing proof. Its raw nonzero result remains recorded separately from the seven passed core criteria. No cache was cleared to manufacture a result; screenshots and visual acceptance were omitted.

## Published recovery work, not silently integrated work

Four older local tips were absent from GitHub. Their new-commit content and the thirteen uncommitted files were reviewed, strictly secret-scanned and privately preserved. The thirteen-file archive was extracted and all original file bytes compared successfully. The four exact tips are now published under these archival refs:

| Archival ref | Exact tip |
| --- | --- |
| `archive/20261117/approval-persistence-repro` | `0c1eac6b3f5058aef33b66d2596b345cca7ba1ed` |
| `archive/20261117/dependency-runtime-bumps` | `cd214aab02ba2d0301a0a101b805bfeb63612b69` |
| `archive/20261117/hermes-current-roadmap` | `459bcf582c004247f22f3e9cb7357c97920f3751` |
| `archive/20261117/vanta-companion-spike` | `a32f8c482482cd8d00607b4b7934035fa667d935` |

A separate exact ten-file Vanta source snapshot is published at [`f13b5abf`](https://github.com/jpoindexter/Vanta/commit/f13b5abf35ac8bb0d231ddf7c58fd0f1a0240e55), under `archive/20261117/legacy-uncommitted-vanta`. Three standalone local utilities remain privately preserved and excluded from the public product repository. The original dirty checkout was not cleaned, reset or switched.

The ten-file snapshot passed runtime typecheck, 33 affected provider/search tests, five architecture checks and secret scanning. It is **not integration-ready**: targeted size analysis identified one new complexity violation in the preserved original `applyCodexEvent` function. The legacy lint command also lacks baseline support and reported 195 whole-tree findings. No baseline was rewritten or gate downgraded; no archived feature was activated, merged or counted as shipped. Archival recovery preserves imperfect work rather than certifying it.

## Branch cleanup

Deleted **57 redundant GitHub branch refs** and **one redundant local ref** after recording their exact ref/SHA pairs. Each remote tip was contained in the retained pushed integration history; none was checked out across six inspected Git families or the head/base of an open PR. Remote readback confirmed all 57 names absent and both integration and protected `main` unchanged. The commits remain reachable, and a removed branch can be recreated at its recorded SHA. No force-push, history rewrite, source/worktree deletion, PR closure or merge occurred.

At the cleanup checkpoint there were **43 remote heads** after preserving five archive refs, and **15 open PRs**, including security PR #87 awaiting independent review. Closed PRs are not treated as merged. Unavailable/divergent tips, active worktrees, the common object store, live runtime dependencies, ignored configuration and rollback material remain held separately from branch-ref cleanup.

Submitting the current integration stack is separate from merging it. The verified `19d68ed5` baseline is 612 commits ahead of protected `main`, with 7,566 changed files including 786 binary files and seven inherited Rust files. A draft integration PR must disclose this cumulative scope; today's narrow checks do not certify the whole inherited stack. PR #87's two security commits are not ancestors of this integration and remain a separate review. Do not hide that review debt by choosing an already-diverged feature branch as the PR base.

## Old generated installations

Before retirement, the actual installed 0.1.3 app opened in a separate native test profile, rendered its titlebar/setup, and produced zero renderer errors without a provider connection or prompt. The running owner's instance was not quit or changed. Both the installed app and the retained private rollback passed signature/staple validation and shared an exact 19,542-file fingerprint.

Four older generated rollback app payloads were permanently retired, retaining their receipts and pushed source commits. The current app, its verified private rollback, the two newest native rollback copies and the signed 0.1.4 candidate were kept. The old source checkout and live/rollback runtime configuration were not deleted. An exact SHA-256/size-matched local 0.1.0 ZIP was also removed; its public GitHub asset remains downloadable. The older app binaries are not promised byte-identical recovery from source alone.

Post-action checks confirmed the four payloads and ZIP absent, receipts intact and protected app hashes unchanged. The immediate disk measurement showed no free-space increase; allocated file size is not a measured reclaimed-space claim. No snapshot, backup root, owner profile, credentials, database or unrelated project was removed.

## Evidence and remaining work

The existing DN-22 and UX-04 Trello checklists now distinguish the corrected floating-editor fixture, isolated native focus proof, executed packaged first-launch checks, and outstanding cold-restore/installed/live acceptance. Canonical statuses, shipped history, dependencies and the two Building lanes are unchanged. The [reliability follow-through](hermes-agent-reliability-followthrough-2026-11-17.md) retains each repair's exact evidence boundary.

Next: restore valid notarization authority, notarize and verify the exact app/archive, finish the signed DMG and normal-app update with backups/idle checks, then run the still-open native typing and owner acceptance paths. Do not replace those gates with unit counts. GitHub's default-branch dependency alerts and independent-review requirement remain separate; this feature-branch publication and cleanup do not resolve them.
