# Agent delivery and preservation checkpoint — 17 November 2026

## Current delivery boundary

Newer derived-task admission source is recorded in the [reliability evidence](hermes-agent-reliability-followthrough-2026-11-17.md#derived-task-recovery-fence). Its compiled CLI entrypoint proof is separate from the signed `8e903828` package below; a new exact-source build is required before claiming that guard is in a delivered app.

The current signed local Desktop candidate uses clean [`8e903828`](https://github.com/jpoindexter/Vanta/commit/8e90382835913180a853227cd303038fb03ef3cc). It includes the bounded worker-status cancellation repair [`795c3293`](https://github.com/jpoindexter/Vanta/commit/795c329365485498a98f3f7a76d28e333eee705c) and original-request stream/adoption repair [`6c33ae0a`](https://github.com/jpoindexter/Vanta/commit/6c33ae0a97614ff4858c239bf53c9c1f2ef46b6c), recorded in the [reliability evidence](hermes-agent-reliability-followthrough-2026-11-17.md). The existing global CLI launcher selects an independent runtime built from the earlier verified [`19d68ed5`](https://github.com/jpoindexter/Vanta/commit/19d68ed5f145cbcdf82596ee3683dc00e339384d), after fresh owner approval. Its previous selection is retained for guarded rollback; the previous checkout, uncommitted files and running processes remain untouched. No credentials or approvals were migrated, and that exact-pin approval was not reused to select a newer runtime.

### Current exact-build verification: 0.1.4 / 8e903828

The earlier signed `21144177` app, ZIP and report were preserved together before the maintained package command rebuilt from clean `8e903828`, using Node 22 and the unchanged hash-verified kernel. The current app passed deep-strict Developer ID verification, including its exact bundle identifier and publisher requirement. Source/input stability checks passed; provenance remains explicitly non-hermetic rather than claiming a reproducible build.

The current package independently reran all seven first-launch/restart criteria over three isolated launches and the six-step uncached-chat typing/attachment journey described below. Both runs passed with zero renderer errors: exactly one synthetic model request for first-launch/restart, and two explicit setup sends for the separate uncached journey. The latter again captured 19 characters while no editor existed, restored exact text/caret/focus once, prevented foreign-file custody and automatic sending, and retained the original recipient's draft/file. Real packaged renderer, preload, bridge and bundled runtime; synthetic provider output and fixture-supplied native picker selection only. No owner profile, visual acceptance or live inference claim.

A separate three-step native stream-ownership check also passed on that exact package. Actual UI send A completed through its HTTP result while its original terminal packets were held at the existing main-to-preload bridge. After explicit UI send B, releasing those same packets in order left B running, with one visible A assistant message and matching original-runtime request-identity/running readback. The actual composer Stop ended B through its own interrupted HTTP result. Exactly two explicit chat POSTs and two loopback model calls in the successful run, zero retry POSTs and zero renderer errors. This delays real parsed IPC packets, not raw HTTP bytes, and does not fabricate frames or patch renderer state. Two retained setup attempts hit fixture-only selector ambiguities (an accessibility announcement and two legitimate Stop controls); they used three additional synthetic calls before the corrected selector run. This does not establish native known-idle adoption or the broader dropped-chunk/attachment-offset contract.

Current ASAR SHA-256: `44c2a818948a017823766ae47b3f926107252a4f1e82e91238844e1e2941565a`; signed ZIP: `d0914ce61b28b594f6329c302b0e1a22a79a4e6d6db8fc58cc6eba20a911a3eb`. The current local DMG was built from that prepackaged app without rebuilding its payload, separately Developer ID signed, checksum-verified and mounted read-only. Its deep-strict publisher verification and complete **19,799-file** payload fingerprint matched the source app; the Applications shortcut was correct and the mount was ejected. Shared app fingerprint: `2f8b830a9e53c8824e8e980fb5a35d7e60117363f37b632798a7cca3a95d10f4`. DMG SHA-256: `bde07c73379fb7efc137adcb53255fea400c86c73af3f140cd2f12c3757bf678`, **201,581,176 bytes**.

These are local signed artifacts, **not notarized, installed or published**. The saved notarization credentials remain an unresolved HTTP 401 blocker; no replacement key was created or revoked. The normal app remains `0.1.3` and the normal CLI remains the separately approved `19d68ed5` pin. Historical package evidence below retains its original build identity.

### Earlier isolated delivery evidence

Before cutover, the actual unchanged launcher ran four isolated checks using its compiled runtime: empty fallback diagnosis, ordered fallback diagnosis including unavailable/unchecked entries, expired MCP authentication despite a healthy cached probe, and interrupted-child inspection. All passed their exact expected output/exit contracts. Guards observed zero network attempts, application-requested child launches, protected credential reads or writes outside the private fixtures. Existing fixture inputs and launcher bytes stayed unchanged. A private preinitialized Git marker excluded optional first-home Git setup; normal-profile inference, TUI behavior, live MCP and worker continuation were not tested.

Desktop **0.1.4** was built from clean `19d68ed5` using Node 22, Developer ID signed, and passed deep strict signature verification. The unchanged kernel source matched the installed build's source; its separately copied kernel bytes were hash-verified. No protected kernel or factory source was changed for delivery.

The actual packaged app passed seven core first-launch/restart criteria across three isolated launches: missing-provider setup, deferred-setup draft persistence, rejected-send recovery without inference, offline endpoint retry, explicit restore without automatic resending, one explicit send producing one synthetic-provider reply, and same-chat/draft persistence after restart. Zero renderer errors were observed. Paid output was mocked at loopback; the renderer, preload, IPC, API and bundled runtime were real.

**Not delivered:** Apple rejects the existing notarization profile with HTTP 401. No replacement key was created or revoked. No new notarized ZIP/DMG, updater release, normal-app installation or live help-site deployment is claimed. The normal installed Desktop remains the previously delivered **0.1.3 / `b2847a8f`**, with its rollback preserved. A signed local candidate is not a notarized public release.

**Uncached typing was reproduced and then verified on the rebuilt package:** the first held-response attempt found an already-mounted cached editor. A subsequent fixture created a distinct conversation through the real API and held its authoritative open/transcript responses before an editor mounted. That reproduction found actual loss of all 19 claimed characters on signed `19d68ed5`. Both original results are retained.

After the narrow ownership repair, Desktop 0.1.4 was rebuilt from clean `21144177` with Node 22 and the unchanged verified kernel, then Developer ID signed and deep-strict verified. The same six-step native journey passed: a real file staged through the normal attachment UI, real runtime-created uncached history, sidebar navigation with no editor during held responses, exact 19-character draft/caret/focus in the announced destination, no foreign attachment or automatic send, and return to the original exact draft plus attachment. Zero renderer errors; exactly two synthetic setup sends. Only the native picker selection and loopback provider output were supplied by the fixture. No cache clearing, owner-profile interaction, screenshots or visual sign-off.

The earlier seven core first-launch/restart criteria belong to the `19d68ed5` package; they were not all rerun against `21144177` and are not relabelled as that build's evidence. The previous signed candidate, ZIP and report were moved together into private preservation before packaging replaced the generated paths. That earlier candidate's ASAR SHA-256: `793bef0b132b73f17ffd4daa359535105689d75ed4e3b1e2e71bfe0c3f40c5bf`; signed ZIP SHA-256: `bbd5fa49bf9b465d5ae250365e412cad57cccdab374ebd9895104ab716633fbd`. These are local signed artifacts, not notarized public downloads.

### Earlier local signed DMG candidate: 21144177

The existing electron-builder installer layout packaged that exact app through `--prepackaged`, without rebuilding or re-signing its payload and without publishing updater metadata. The resulting DMG was separately Developer ID signed and passed strict signature and disk-image checksum verification. It was mounted read-only without opening Finder; the mounted app passed deep-strict signature verification and matched the tested source app's complete **19,748-file** fingerprint. The Applications link points to `/Applications`; the owned mount was then ejected.

DMG SHA-256: `6db8a8c42bd358dd249124682c0cf9b10e1b9a07a4329d78f57e8d67a467193f`; size **200,622,388 bytes**. Shared app fingerprint: `12f5de027109bbe1102b4f4016ac88d2bd58e4eff32fd261c3994730ce926226`.

Not established: DMG/app notarization, Finder visual acceptance, actual drag-to-install/first launch from a downloaded image, normal-app replacement or public delivery. No Gatekeeper bypass or weakened verification is supplied. The signed local DMG is held pending valid notarization credentials.

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

### Additional owner-requested obsolete-build cleanup

A separate reviewed batch retired **20 exact generated payloads**, representing **7.29 GiB allocated**: five obsolete test/previous-release ZIPs, redundant extracted apps and rebuildable packaging staging. The installed 0.1.3 app first opened in an isolated native profile with zero renderer errors and the running owner's process unchanged. Immediately before removal, exact paths, tracked-source absence, live/open-file/launcher references and unchanged fingerprints were checked; retained recovery archives and protected apps/source/launcher settings were verified afterward. Each removed path has a private receipt; reports, logs, source/worktrees, runtime selection, the current signed candidate and rollback copies remain. One dirty-provenance test ZIP was held rather than retired. The three Iris archives remain locally and match GitHub **draft** asset metadata, not public-download availability.

Some disposable old test archives were permanently removed; their signed binary bytes are not promised reproducible from source alone. Retired duplicate apps remain recoverable from kept archives or exact rollback copies. macOS reported about 225 GiB available afterward, but its free-space increase greatly exceeded this batch's allocation and must not be attributed to these removals alone. No Time Machine or system snapshot was deleted and no backup/repository root was removed. The pending three-file agent-recovery change was backed up and byte-verified before cleanup and remained unchanged throughout it.

## Evidence and remaining work

The existing DN-22 and UX-04 Trello checklists now distinguish the corrected floating-editor fixture, isolated native focus proof, executed packaged first-launch checks, and outstanding cold-restore/installed/live acceptance. Canonical statuses, shipped history, dependencies and the two Building lanes are unchanged. The [reliability follow-through](hermes-agent-reliability-followthrough-2026-11-17.md) retains each repair's exact evidence boundary.

Next: restore valid notarization authority, notarize this exact app and regenerate its verified archive/DMG with the stapled payload. Notarize/verify the DMG and perform the normal-app update with backups/idle checks. Run the still-open downloaded-installer/installed/live-owner acceptance paths. The current seven core, six uncached and three stream-ownership native criteria are executed for `8e903828`; they do not close whole-desktop, cross-host, visual or broader adopted-reply/attachment-offset acceptance. Do not replace those gates with unit counts. GitHub's default-branch dependency alerts and independent-review requirement remain separate; this feature-branch publication and cleanup do not resolve them.
