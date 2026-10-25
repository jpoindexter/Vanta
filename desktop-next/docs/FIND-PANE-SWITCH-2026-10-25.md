# Keep Find open across pane switches — 2026-10-25

## Done criterion / cause

With two real chats and unsent drafts, Find must follow explicit pane focus or
click while retaining its query, remove old highlights, and return dismissal
to the new draft/caret. Hover alone must not move the search or focus.

Actual baseline fb5be073, root vanta-donepath-s60NzM: Find stayed open and kept
the query, but the captured root remained in the old visible pane after clicking
the other editor. The scope resolver returned an old root merely because it
was still visible; focus restoration remembered only the first opener.
One new focus regression failed before the fix; five older focus cases passed.

## Change

The existing scope re-targeting path now also handles another visible focused
pane. The Find focus hook coalesces explicit pointerdown/focusin inside chat/
composer surfaces, refreshes the current query and remembers the new opener/
caret. Listeners exist only while Find is active and cancel pending work on
close. Repeating Cmd+F from a pane adopts it; repeating inside Find preserves
the opener. Existing scope cleanup clears old marks and its observer.

No hover listener, background navigation, new state store, dependency, control,
copy or global shortcut framework. Small local hook concerns keep the existing
size gate intact; no baseline/suppression changes.

## Executed

- Exact-index source candidate: Vanta-backups/find-switch-candidate-20261025-Chz6ET.
  Build: 339 runtime chunks.
- 93 focused Find tests / five files passed. Six affected focus cases rechecked
  after the final body-focus guard; hidden panes, portaled ownership, query
  persistence and older route/close behavior retained.
- Actual private source Electron root vanta-donepath-bLsjuV: 21 assertions,
  including both fresh pane searches, query retained during focus switch,
  updated root, old highlights cleared, repeated Cmd+F, Escape to the new draft,
  continued typing only there, transcript-click re-targeting, no old-pane focus
  restoration, and hover not moving search. Two scripted local requests total,
  zero renderer errors. Reports/screenshots: `proofs/find-pane-switch-2026-10-25/`.
- Size/architecture/brand/design/staged-secret/diff checks pass. Renderer
  typecheck still has the inherited missing session-resume-active-turn.json
  fixture diagnostic. Not a green renderer typecheck or full test-suite claim.

## Preservation / ongoing goal

Pre-edit bundle/dirty patch/untracked archive verified externally:
Vanta-backups/find-pane-switch-20261025-AOmv9n. All 273 original changed/
untracked regular files byte-identical. Wider design remains unfinished and
preserved; no install/account/profile/Rust/factory/merge/PR edit/tag/release/CI
change. DN-13/22/29 stay open; this is supporting keyboard evidence.

Next: menu/dialog Escape ownership above Find. Installed app, VoiceOver,
arbitrary layouts and large/streaming search are not certified. Continue
dependency-ready cards without routine clarification; owner gates still apply.
