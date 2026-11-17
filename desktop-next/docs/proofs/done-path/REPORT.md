# Slice-1 done-path proof (DN-13), new desktop app

Date: 2026-10-14. Branch `claude/desktop-done-proof-20261014` (from `claude/desktop-integration-20261013` @ c759f645).
App under test: the desktop-next Electron shell (source Electron 43, `apps/desktop/dist` built from this worktree) plus the real Vanta server
(`vanta-ts` via tsx, real Rust kernel, real `permissions.tsv`). Only the model is synthetic: a scripted local OpenAI-compatible server.

## Verdict

**Partly met.** Every step of the done criterion was executed in the real app and passed 20 of 20 runs (below), and two negative controls
show the harness fails when the behaviour is broken. Not met in full because: the approval card names the exact target but shows the wrong
tool wording for non-shell actions, a pasted image does not attach, and nothing here is proven on a packaged build, a real provider, or non-macOS.

## Pass rates, N = 20 (fresh isolated state per run, 0 crashed runs)

| step | passed | what |
|---|---|---|
| a1 | 20/20 | chat in project A: live tool step rows, then a card naming the exact action |
| b | 20/20 | Always allow runs the tool; `permissions.tsv` gains `allow edit_file <root of A>` |
| c | 20/20 | quit; every Electron and server process exits; relaunch on same userData + VANTA_HOME; rule still there |
| d | 20/20 | NEW chat in A, same tool call: no card (cards-seen counter 0), edit runs, first model request has 2 messages (fresh chat) |
| g | 20/20 | edit_file on `deploy-notes.md` and `production-plan.md` after Always: no card, both edited |
| f | 20/20 | `npm publish --dry-run` after Always for shell: card, no Always button, reason text, server payload `canRemember:false` |
| e | 20/20 | project B switched in the app: same edit asks, card names brief.md, Reject leaves B untouched, no rule written for B |
| h1 | 20/20 | 200 KB paste: every keystroke <= 250 ms (max 140 ms, median 83-132 ms, empty-composer baseline <= 21 ms), draft kept, 204,800 chars reached the model |
| h2 | 20/20 | image paste next to a draft: no freeze (max keystroke 17-28 ms), draft kept |
| i1 | 20/20 | 1440x900: full sidebar 275 px, no horizontal overflow |
| i2 | 20/20 | 1100x800: 56 px rail, no horizontal overflow |
| i3 | 20/20 | 800x700: sidebar gone, toggle opens a drawer, Escape closes it, no overflow |

Runs where every step passed: 20/20. 0 failures in 20 means the true failure rate is not shown to be zero: at 95% confidence it could still be up to about 14% (rule of three). Each run took 36-41 s on a machine that was also running other agents' Electron apps.

Probes (recorded, never gate the verdict):

| probe | result | meaning |
|---|---|---|
| a2 | 0/20 | FAIL: card for an `edit_file` says "Run a command" and "Always allow shell commands" (see product findings) |
| c2 | 0/20 | FAIL by design: the Rust kernel is a detached daemon and outlives quit; the harness stops it |
| f2 | 19/20 | plain `git push origin main` after Always for shell. Run 1 (before the fix): ran with no ask. Runs 2-20: asks. See P1 |
| h3 | 0/20 | FAIL: a pasted image is not attached ("Image attach failed: saveImageBuffer is not available in Vanta Desktop yet") |

Disclosure on f2: the P1 fix landed in the worktree while the 20-run batch was running, so run 1 is the only pre-fix sample. Steps a1-i3 do not depend on it.

## Negative controls (the harness can fail)

- `--control wipe-rules` deletes `permissions.tsv` before the relaunch: c, d and g FAIL (card shown, edits not applied). `control-wipe-rules/`.
- `--control unscoped-rule` appends an unscoped `allow edit_file` rule: e FAILs ("project B did not ask"). `control-unscoped-rule/`.

## Claim ledger

Tags: executed = driven in the running app and observed; code-path = read in source only; assumed = not checked.

| claim | tag | evidence | does NOT establish |
|---|---|---|---|
| Thread shows live tool step rows while a turn waits, and a collapsed "Used 2 tools" row after | executed | flake/run-01/a1-card.png, b-after-always.png | the wording the owner expects ("Ran N commands"); the edit_file call is not in the collapsed row |
| Approval card names the exact action (file `brief.md`, command text) and the server pushed a matching payload (`toolName`, `kind`, `canRemember`) | executed | a1-card.json, a1-approval-payload.json (captured from the main-process renderer channel) | correct tool wording on the card (a2 fails) |
| Always allow runs the tool and saves a project-scoped rule | executed | b-permissions.json (before: absent; after: `allow<TAB>edit_file<TAB><TAB>root`) | per-command-prefix grants; two concurrent saves |
| After full quit and relaunch, a NEW chat in the same project is not asked | executed | c-processes.json, d-new-chat.png, control-wipe-rules | a restart through Cmd+Q, Dock, crash or OS reboot; the packaged app |
| A different project still asks; the rule does not leak | executed | e-project-b-card.png, e-projectB-payload.json, e-permissions.json, control-unscoped-rule | the sidebar "New project" path (inert); the native confirm dialog path (`switchProjectForNewTask`); the folder chooser (stubbed, see gaps) |
| One-way action asks every time with no Always and the reason text, even after Always for shell | executed | f-one-way.png, f-oneway-card.json, f-oneway-payload.json | other one-way shapes: `rm -rf`, `git push --force` and `kubectl delete` never reach a card (kernel block or no ask) |
| Editing files named deploy/production with edit_file does not trigger the one-way ask | executed | g-path-text.png | the same edit in a project with no saved rule |
| 200 KB paste keeps keystrokes under 250 ms, keeps the draft, and sends | executed | h1-latency.json, h1-large-paste.png | a real OS clipboard paste (synthetic ClipboardEvent, so the owner's clipboard is never touched); large pastes become inline text because attach is unsupported (P3); with the default 32k context window the server snips a 200 KB message to 4000 chars by design (`graduated-compaction.ts`), the run sets `VANTA_CONTEXT_WINDOW=1000000` |
| Image paste does not freeze or lose the draft | executed | h2-image.json, h2-image-paste.png | that the image attaches (h3 fails) |
| Collapse at 1440 / 1100 / 800 with no horizontal overflow | executed | i-1440/1100/800.png, i-800-drawer.png, i-*.json (scrollWidth <= clientWidth on html, body, #root) | pixel match to the wireframe; the workbench overlay/sheet; light/dark; keyboard-only and VoiceOver passes |
| The saved rule is read by every lookup, including the inner edit_file approval | executed | steps b and d (edit_file is the inner-approval tool) | other inner approvals (write_file, fetch) |
| Server fix merged earlier is the cause of the persistence | code-path | learnings/2026-10-13-scoped-rules-need-every-lookup.md | not re-derived here |
| Behaviour with a real model provider | assumed | none | everything about real tool-call shapes, latency, streaming |

## Product findings

P1 (fixed, small). A plain `git push origin main` ran without a card once Always was saved for shell commands, although the kernel calls it
"Irreversible action" and the card says irreversible commands always ask. Cause: `isOneWayDoor` only matched `push --force`. Fix: add `git push`.
Files: `vanta-ts/src/operator-profile/profile.ts`, `vanta-ts/src/operator-profile/profile.test.ts` (two new tests). Related suites (26 files, 427 tests) pass, `tsc --noEmit` clean. Separate commit so it can be dropped.

P2 (not fixed, off-limits files). The approval card is wrong for non-shell actions. For `edit_file` it shows "Run a command", "Always allow shell commands" and
"Always covers every shell command Vanta runs in <project>", while the saved rule is for `edit_file` only. The server payload is correct (`kind:file_edit`). Cause: `approvalParams`
sends `vanta_request`, but the renderer drops it: `src/components/assistant-ui/tool/approval-adapter.ts` fabricates `kind:'bash'` / `toolName:'terminal'`, and
`src/store/prompts.ts`, `src/app/session/hooks/use-session-actions/restore-pending-approval.ts` and `src/app/session/hooks/use-message-stream/gateway-event/server-requests.ts`
do not carry `vanta_request` through. Evidence: `flake/run-01/a1-card.json`, `e-project-b-card.png`.

P3 (not fixed, off-limits files). Image paste and large-text paste-to-attachment fail with "saveImageBuffer / savePastedText is not available in Vanta Desktop yet".
Both are declared in `electron/vanta/surface-manifest.ts` but have no handler in `electron/vanta/bridge-*.ts`. The composer degrades safely (toast, inline text, no freeze).

P4 (owner decision). The kernel is spawned detached (`vanta-ts/src/kernel-launcher.ts`) and outlives app quit; this machine has dozens of orphaned kernels from other worktrees. The saved rule lives in `permissions.tsv`, not in the kernel, so persistence does not depend on it.

P5 (unproven, one sighting). Before the harness pinned a private kernel port, one run showed "vanta-kernel did not become ready ... on http://127.0.0.1:7788" and the provider-setup screen. `kernel-launcher.ts` probes `/api/status` once with a 750 ms timeout and, on null, tries to start a kernel on the occupied default port. The owner's kernel answers in about 3 ms when idle, so the trigger was a transient miss I could not reproduce. It is not covered by the N=20 (the harness now sets `VANTA_KERNEL_URL` to a free port so a proof never touches the owner's kernel). A single retry on a null probe is the suggested fix; not made because the cause is unproven.

Observations, not investigated: `mkdir newdir` inside the project asked with "may touch a path outside the approved Vanta folder"; the rail shows "No chats yet." clipped at 1100 px; console shows `unsupported: desktopPluginsRoot` and `getRemoteDisplayReason` stubs.

## Known gaps

- Scripted model only: no real provider turn.
- Source Electron against a dev build, not a packaged, signed or notarized app; macOS only.
- The native folder chooser is stubbed in the main process (`dialog.showOpenDialog`) because a test cannot click it. The project switch itself (`settings.setDefaultProjectDir` -> runtime restart -> reload) is real.
- The kernel port is pinned per run, and alpha's kernel is stopped before switching to bravo (a pinned `VANTA_KERNEL_URL` cannot serve two roots; unpinned, the launcher uses a port per root).
- Paste is a synthetic ClipboardEvent, not the OS clipboard.
- N=20 on one machine under shared load; no soak, no low-memory or slow-disk runs.
- Layout is checked by structure and overflow, not pixel comparison with the wireframe.

## Reproduce

Prerequisites: `desktop-next/node_modules`, `desktop-next/apps/desktop/node_modules`, `vanta-ts/node_modules` present, and a kernel binary at `target/debug/vanta-kernel`.

```
cd desktop-next
node tools/build-vanta.mjs
node tools/done-path/run.mjs --out docs/proofs/done-path/run-x        # one run, prints one JSON line, exit 1 on any failed step
node tools/done-path/flake.mjs --runs 20 --out docs/proofs/done-path/flake
node tools/done-path/run.mjs --control wipe-rules --out /tmp/c1        # must FAIL c, d, g
node tools/done-path/run.mjs --control unscoped-rule --out /tmp/c2     # must FAIL e
```

Isolation: each run makes its own HOME, VANTA_HOME, Electron userData, two git projects and a free kernel port under the OS temp dir, hides the window off-screen and inactive, and removes everything and stops the kernel at the end.

## Screenshots (flake/run-01)

a1-card, b-after-always, d-new-chat, f-one-way, e-project-b-card, g-path-text, h1-large-paste, h2-image-paste, i-1440, i-1100, i-800, i-800-drawer. Per-step JSON evidence sits beside them; the other 19 runs keep JSON only plus any FAIL-*.png (none were produced).
