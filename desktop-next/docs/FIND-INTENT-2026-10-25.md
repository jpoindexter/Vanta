# Find retains pane intent across queued focus — 2026-10-25

Delivery follow-on: source745629c6 is now signed/notarized and installed;
actual installed split-Find27checks/two requests/zero errors pass. See
PARALLEL-DELIVERY-2026-10-25.md. Source-stage limits below are historical, not
current installation identity; owner/VoiceOver/whole-Desktop gates remain.

## Observed criterion and correction

Switching to a pane while Find is open must retain that pane as the query's
scope, even if a sidebar menu takes focus before the next animation frame.
The installed f94c5025 replay exposed the race after21 passing assertions;
a diagnostic27-check pass did not erase that failure. The queued callback
resolved document.activeElement after the menu had taken it, falling back to
the first visible chat. Details: SECURITY-DELIVERY-2026-10-25.md.

Small correction: pass the originating element into the existing scope
resolver/capture function instead of consulting later focus. Skip a detached
or hidden originating element. Existing callers retain their current-focus
default; no new store, dependency, policy or focus-stealing framework.
The proof opens the directional submenu through its keyboard ArrowRight path;
off-screen click-through hover did not open it, and is not recertified here.

## Executed source evidence

- Deterministic queued-frame regression fails before and passes after. It
  moves focus outside either chat before releasing the captured frame.
-101 focused tests/four files pass; renderer tsc exits0.
- Isolated Electron43.8.1 source renderer/native builds pass. Real private
  source replay passes27checks, two loopback model requests, zero renderer
  errors: pane targeting, query/highlight cleanup, drafts/carets, one-layer
  menu/palette Escape and no submission/retry.
- Source root vanta-donepath-1oSY9L; report and screenshot in
  `proofs/find-intent-2026-10-25/`. Both changed runtime modules and proof
  script match the reviewed working-tree bytes.
- Changed source size: five inherited findings, zero new/worse. Five
  architectural boundaries pass; brand/design scans zero. No baseline reset.

Harness note: an initial source launch lacked electron-main.mjs because the
renderer-only Vite build clears dist. Only that owned test process was stopped;
native bundle rebuilt, then the actual replay ran. This was not an app startup
failure claim. No test loops or relaxed assertions were used for acceptance.

## Limit

Independent follow-on review found dismissal origin could still retain the old
pane when sidebar focus preceded the queued frame. The same regression now
also presses Escape and asserts second-editor focus; it fails before recording
focusin origin synchronously. This follow-on is tracked separately from the
earlier27-check/101-test evidence above, not retroactively claimed installed.
The final101-test Find set passes with that dismissal assertion. Ignore late
focus events once Find is closed so restoring a rich-editor focus does not
overwrite its saved caret; the existing caret regression caught this during
the narrow check and passes after that guard. No assertion was removed.

This correction is source accepted, not yet packaged/installed. The installed
security candidate remains f94c5025 until a later combined replacement passes
its exact installed journey. No owner visual, audible VoiceOver, normal-profile
or complete Desktop acceptance. Original unrelated work remains preserved.
