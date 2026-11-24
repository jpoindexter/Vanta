# Transcript keyboard navigation — 2026-10-24

## Bounded change

The transcript rail was a Tab stop per mounted prompt, despite already having
arrow/Home/End navigation. Its keyboard focus treatment was a 1px inset stroke
with about 7% foreground opacity. An actual four-message replay reproduced both.

The existing rail now has one sequential Tab stop. Arrows move that stop, and
leaving the rail resets its entry point to the current prompt. A visible-slice
fallback keeps it reachable when the active prompt is virtualized away. No new
navigation screen, toolbar, shortcut or persistent setting. The existing 2px
ring token replaces the faint stroke; its inset placement avoids clipping the
compact rail. Pointer geometry, stable IDs, virtualized DOM budget and Enter's
existing jump action remain.

Design principles: predictable focus order, recognition over recall, one
component with explicit keyboard/selected states, and no added interface chrome.

## Executed evidence and limits

- The one-stop regression failed before the production change. A second narrow
  virtual-slice regression caught a zero-stop edge case and failed before its
  visible-item fallback. Both remain in timeline-rail.test.tsx.
- 17 focused tests / 3 files passed in the exact-index candidate: the rail,
  timeline data and viewport ownership/position. The 5,000-entry mounted-DOM
  bound remains tested, not a real 5,000-turn runtime acceptance claim.
- Actual source Electron, private HOME/VANTA_HOME/project/userData/kernel port,
  existing done-path harness and local scripted model: 21 assertions passed.
  Four real replies; Shift+Tab entry; one stop; 2px ring; Home/End/arrows and
  boundary clamp; Enter jumps to the first prompt; Tab exits; keyboard Scroll to
  bottom returns to the latest reply; Tab reaches the composer; an unsent draft
  survives subsequent scrolling. Four model requests total, zero renderer errors.
- Source build passed, 339 runtime chunks. Size ratchet has one inherited
  violation, none new/worse. Five architecture boundaries pass; brand has zero
  matches; design counts do not increase; syntax/diff/secret gates pass.
- Renderer TypeScript still fails only for the inherited missing
  session-resume-active-turn.json fixture. It is not green.

Run from desktop-next:

```sh
node tools/build-vanta.mjs
node tools/proof/keyboard-timeline.mjs
```

Candidate: /Users/jasonpoindexter/Documents/GitHub/docs/Vanta-backups/navigation-candidate-20261024-76Nr4x.
Initial baseline: vanta-donepath-lqR1FM; failing one-stop actual proof:
vanta-donepath-brppZ3. The retained successful four-message report and captures
are under proofs/keyboard-timeline-2026-10-24/. Temporary roots live under
/private/var/folders/rj/nj_9qs2s7zs52nsc90yl2q700000gn/T/.
Final exact-index replay root: vanta-donepath-WgEBpg.

## Separate observed gaps, not fixed here

Cmd+L from Scroll to bottom failed in one replay and succeeded in another.
The shared overlay predicate also matches passive tooltip wrappers; an isolated
regression demonstrates this, but attempts to hold the tooltip open in the
hidden-window harness used wrong timing/trigger assumptions. That chase stopped.
No shortcut or overlay code was changed, and no live tooltip/chord repair is
claimed. The proposed failing regression is preserved outside the checkout at
navigation-20261024-Vja135/tooltip-regression.patch in Vanta-backups.
Evidence roots: lbLPc2 (timeout) and hvP3Id (chord succeeded; wrapper captured).

One replay also showed the third/fourth prompt labels in unexpected index order;
chronological ordering is not certified by the index-based keyboard assertions.
Keep that as a separate source-data investigation rather than claiming full
history correctness. The first-prompt actual jump is observed.

Not checked: full sidebar/menu/split navigation, VoiceOver, zoom, complete
contrast audit, live accounts, installed/package acceptance, full suite or CI.
DN-13/22/29 remain open. No main merge, PR edit, tag, release or installation.

## Preservation

Pre-edit complete verified branch bundle, binary dirty patch and untracked
archive: /Users/jasonpoindexter/Documents/GitHub/docs/Vanta-backups/navigation-20261024-Vja135/.
All 273 pre-existing changed/untracked files remain byte-identical. Protected
files, older proofs and unfinished visual-design hunks are not staged. A fresh
post-commit source backup retains both the new branch history and remaining
dirty/untracked work. No deletion, reset, stash, force-push or owner-profile edit.
