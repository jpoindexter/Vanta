# Find survives closing its document from the query field — 2026-10-25

## Criterion and observed cause

With Find open and its input focused, Cmd+W closes the searched document.
Find must retain its query, search the surviving visible chat, and return
typing focus on Escape without changing a draft/file or sending a message.

Baseline source Electron vanta-donepath-1IzBGh closed the document but left
the focused query with no data-find-root. A removed pane was no longer in
the document-wide root lookup. No pane-focus event occurred because the
query input retained focus. Two new regressions failed (38 adjacent passed).
Closing from document focus already passed in vanta-donepath-ObdVPT; that
different path did not establish the query-focused case.

## Repair

- The existing scope lifecycle retains a detached captured root for cleanup
  and re-targeting, without reviving a released search.
- FindBar reuses its existing body/pane observer and refreshes the query only
  when the captured scope changes. No second observer, global event or polling.
- Explicit dismissal falls back to the surviving scoped chat composer only
  if its old opener is unavailable. Existing visible-opener/caret and newer-
  focus guards remain; floating composers use their existing owner identity.
- The scope unit fixture now releases scope in cleanup, instead of leaving
  a stale detached reference between tests.

## Executed evidence

- Exact-index candidate: Vanta-backups/find-close-candidate-20261025-28vNXY.
- 95 focused tests / three files pass: scope lifecycle, FindBar and focus.
- Actual source Electron vanta-donepath-uYZuMf: 10 checks pass. Query focus
  before Cmd+W, retained search and query, new chat match, Escape to composer,
  exact unchanged draft/file, one local scripted request, zero renderer errors.
- The first post-fix replay reached the correct chat, then typed before the
  deferred repeat-Cmd+F selection had completed. The driver had checked only
  selectionEnd (also true for an unselected end caret); it now checks both
  selection endpoints before typing. That diagnostic is retained. Immediate
  fast typing after the chord remains a separate next keyboard item.
- The adjacent backward/forward focus walk checks seven real controls,
  painted opacity and existing 2px outline/inset rings, returning to the draft.
  An early check mistook the normal reveal transition and timeline's inset
  ring for defects. They were verification assumptions; no styling changed.
- Build: 339 runtime chunks. Three production files, eight inherited size
  violations and none new/worse. Five architecture boundaries pass; zero
  brand findings and no design-debt increase. Staged secret/diff checks pass.
  Renderer typecheck still fails only for the inherited missing
  session-resume-active-turn.json fixture; it is not green.

## Preservation and remaining work

All 273 original changed/untracked regular files are byte-identical. The
verified pre-edit recovery checkpoint is pane-close-final-20261025-rrKIoC,
containing complete branch bundle, dirty patch and untracked archive. Restore
only in a new empty directory. No unrelated design hunks enter this checkpoint.

No installed app, VoiceOver, whole-shell contrast, reduced-motion, PDF/browser
guest or virtualized source-editor acceptance is claimed. No installation,
profile/account/Rust/factory change, main merge, PR edit, tag, release or CI
enabling. DN-13/22/29 remain open; broader goal ACTIVE. Next: immediate repeat-
Cmd+F input, then reduced-motion/live-announcement navigation gaps. Owner-only
and parked gates remain unchanged; no N=20 proof marathon.
