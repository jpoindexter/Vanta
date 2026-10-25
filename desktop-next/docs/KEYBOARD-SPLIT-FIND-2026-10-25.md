# Opening Find follows the active chat — 2026-10-25

## Done criterion and observed cause

Open two real chats side by side, place an unsent draft in each, and open Find
from each editor. Search must target that editor's chat, not its neighbor;
Escape must return to the correct draft without submitting it.

Baseline b4b7d3e0, actual source Electron root vanta-donepath-eqYTa2: Find in
Bravo worked; Find in Alpha captured Bravo's data-find-root and returned zero
matches. Both drafts survived. resolveCurrentFindScope always chose the first
visible DOM surface and ignored focus. Three new targeted tests failed before
the fix; the existing first-visible/hidden-pane fallback test passed.

## Smallest shared fix

The one existing resolver now chooses a visible focused chat or floating
composer's existing surface ID; then the existing interacted layout group;
then the first visible chat. No new focus tracker, picker, DOM identifier,
dependency or navigation control. Current capture/close behavior remains.
The same resolver is used by initial capture and hidden-scope re-targeting.
Existing rendered-chat visibility policy still excludes keep-alive panes.

## Executed evidence

- Exact-index candidate: Vanta-backups/split-find-candidate-20261025-0BEBpU.
  Source build produced 339 runtime chunks.
- 92 focused Find tests across five files pass. New tests cover the second
  split, group fallback from chrome, a portaled composer with a stale group,
  and hidden-pane exclusion. Floating ownership is component/source proof,
  not an actual native floating-composer acceptance claim.
- Real isolated Electron root vanta-donepath-ikiFKW: 11 assertions. Existing
  New session → Open in split → Right creates the second chat; two local
  scripted model replies; both editor-origin searches capture their exact
  surface identity and find content; Escape restores each editor's focus;
  both drafts retained; two model requests total; zero renderer errors.
  Reports/screenshots: `proofs/split-find-focus-2026-10-25/`.
- Size ratchet: five inherited violations, none new/worse; all five architecture
  boundaries pass. Brand zero, design no increase, staged secret scan and
  diff check pass. Renderer typecheck still reports the inherited missing
  tests/fixtures/session-resume-active-turn.json, not a green typecheck.

## Preservation / next

Verified pre-edit bundle, tracked dirty patch and untracked archive:
Vanta-backups/keyboard-navigation-20261025-2LsHPp. All 273 pre-existing dirty/
untracked regular files remain byte-identical; unfinished design stays intact.
No app installation, normal profile/account/credential change, Rust/factory,
merge, PR edit, release/tag or CI enabling. DN-13/22/29 remain open.

Not certified: installed app, VoiceOver, all split layouts or large/streaming
search performance. Next: repeat Cmd+F after moving to another pane while Find
is already open; this bounded proof closes Find between each editor-origin
search and does not establish that separate interaction.
