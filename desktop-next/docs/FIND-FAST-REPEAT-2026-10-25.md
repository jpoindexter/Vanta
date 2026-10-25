# Repeated Find preserves immediately typed characters — 2026-10-25

## Criterion and cause

With the Find input already focused, Cmd+F followed immediately by typing
must replace the previous query without dropping its first characters.
Escape must return to the unchanged chat draft without sending a message.

Actual baseline source Electron vanta-donepath-0lNFPC replaced the query with
"cripted turn finished." instead of "Scripted turn finished.". Repeating Find
deferred both focus and select to an animation frame even though the input
already had focus. That later selection overwrote the first typed character.
The new focused regression failed; 11 adjacent focus tests passed.

## Repair and executed evidence

- Five lines in the existing focus hook: when the requested input already
  owns focus, select immediately and do not schedule a later selection. First
  open and handoff from other controls/panes retain their existing deferred
  focus, origin, scope and caret behavior. No new UI, event, dependency or timer.
- Exact-index candidate: Vanta-backups/find-fast-candidate-20261025-EXsJDm.
  Source build produces 339 runtime chunks.
- 67 focused tests / two files pass (FindBar and focus). The regression checks
  immediate selection, inserts a first character, then flushes queued frames
  and confirms they cannot reselect that character.
- Actual source Electron vanta-donepath-w8orMg: seven checks pass. Three native
  Cmd+F → keyboard.type sequences replace complete queries, with no selection
  wait between chord and typing. The short wait between cases only settles
  the previous query's existing debounce. Escape restores typing focus; exact
  draft retained, one scripted local request, zero renderer errors.
- Adjacent source Electron vanta-donepath-gzzcbT: all 10 query-focused
  document-close checks still pass, including re-targeting and Escape typing
  return, unchanged draft/file, one local request and zero renderer errors.
- One production file is within every size limit; five architecture boundaries
  pass, zero brand findings and no design-debt increase. Staged secret/diff
  checks pass. No full test suite or fresh renderer typecheck for this change;
  the preceding renderer typecheck failed for the inherited missing
  session-resume-active-turn.json fixture and is not a green baseline.

## Preservation and scope

All 273 original changed/untracked regular files remain byte-identical. Verified
pre-edit recovery: find-close-final-20261025-GVUEcV (complete branch bundle,
dirty patch and untracked archive). Restore only into a new empty directory.
No unrelated design work is staged.

This proves repeated Find in the source Electron app, not all rapid-input/IME
paths, installed app or VoiceOver. No installation, profile/account/Rust/factory
changes, main merge, PR edit, tag/release or CI enabling. DN-13/22/29 remain open;
goal ACTIVE. Next: dependency-ready reduced-motion/live-announcement navigation
gaps. Owner and parked gates remain unchanged; no N=20 proof marathon.
