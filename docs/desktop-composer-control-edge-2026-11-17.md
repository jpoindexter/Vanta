# Composer control edge — 17 November 2026

Repair for the reported Send/Stop circle clipping, executed in source and the
signed v0.1.1 isolated installed copy. Normal-profile installation, native
updater replacement and DMG delivery remain separate gates.

## Executed cause, not a radius guess

An isolated source Electron replay reproduced the visible lower-right cut. The
32×32 control had a full circular radius and no mask of its own, but its parent
`composer-fade` inherited the surface's 22px radius with `overflow: hidden`.
Vanta's inner padding is zero; the outer composer already provides 12px inset
and its own rounded clipping. Repeating the large radius at the inner boundary
therefore cuts the circle instead of following the actual composer edge.

At 1440px and 800px window widths, three of sixteen sample points one pixel
inside the circle missed the button: 22.5°, 45° and 67.5° around its lower-right
arc. The same failure occurred for Send and Stop. Cardinal-point-only checks
would have missed it.

Applying the exact source repair to that same renderer recovered all sixteen
points without moving or resizing the control. Before/after screenshots were
inspected. No button-radius increase, extra composer padding, model change or
permission change was needed.

The repaired circle also retained all sixteen points with a saved file chip at
800px, at the 500px narrow-window check and again at 1440px. These are actual
window sizes, not a simulated split-pane layout. Zero renderer errors occurred.

## Repair and source comparison

The Vanta skin clears only `composer-fade`'s redundant inner radius. Rectangular
inner overflow containment and the outer surface's rounded clipping stay in
place. The HUD and non-Vanta skins are excluded.

Public Hermes source at `7abd4a227e6eacbf34977e3ed4c56bea895ce1cc`,
`apps/desktop/src/app/chat/composer/index.tsx`, contains the inherited-radius,
overflow-hidden inner wrapper too. That is source evidence for the ancestry,
not a claim that the upstream desktop reproduces Vanta's skin-specific bug.
The earlier private installer REA export did not contain composer CSS/source.

## Executed source proof

The existing composer presentation contract gained one declaration regression;
it failed before the scoped CSS rule and passed after it. The combined image,
action, thumbnail and composer-contract run passed 60 tests in four files. A
declaration check does not prove native geometry; the separate Electron hit-test
and screenshot replay supplies the geometry evidence described above.

The source fixture uses synthetic projects, an isolated profile and a local
mock provider. It does not interact with the owner's running app or history.
That initial geometry proof injected the exact canonical CSS rule because
shared output builds were reserved for the packaging lane; it was not signed
package acceptance.

## Executed signed installed-copy proof

The subsequent replay launched the signed v0.1.1 app from its isolated installed
copy after the release lane completed notarization, stapling and Gatekeeper
checks. It used the bundle's own runtime and kernel, with no CSS injection or
source substitutions. Build identity:

- Source: `819a67da9a6d0ba1e142ee0690bdf06b1d49ba30`.
- `app.isPackaged`: true; observed app version: `0.1.1`.
- Observed `app.asar` SHA-256:
  `06d54e0ecf03ca5cdd28054edc2c27db9ded19c136952ce9a03d6778645d26a7`.

The complete replay exited zero: 10 geometry captures, 11 visible controls,
176 inside-circle hit points and zero misses. Attachment/Send, enabled idle
Send and running Stop each passed at actual 500px, 800px and 1440px window
widths. A real UI-created split at 1440px exposed both complete Send circles
and retained distinct drafts in its two panes. Zero renderer errors occurred.

Actual signed full-scene screenshots and composer/control locator crops were
captured for running Stop and attachment/Send; the whole lower-right arcs were
visually inspected. No screenshot or image was modified to produce the proof.
Private evidence includes `run2/result.json`, `run2/geometry.json`,
`run2/identity.json`, `running-stop-1440-composer.png`,
`attachment-1440-composer.png` and `real-split-send-1440.png`.

The first signed replay reached the split but its fixture filled an inactive
editor without pointer activation, leaving the second Send disabled. That run
was not counted as complete. The corrected fixture clicks each real editor
before filling it and asserts distinct text; the full rerun passed without an
application change. Earlier failing controls and screenshots remain retained.

## Remaining limits

This clears the named circle-clipping replay, not the whole desktop redesign,
all zoom/accessibility combinations or owner-profile acceptance. The fixture
used synthetic projects and a local mock model; live-provider interpretation
and the original tester's separate attachment/reset incident are not proved by
these geometry checks. Owner history, credentials and normal profiles stayed
untouched.
