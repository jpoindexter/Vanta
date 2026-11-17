# Composer control edge — 17 November 2026

Source repair for the reported Send/Stop circle clipping. Final signed package
and installed-copy acceptance remain separate gates.

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

## Narrow proof and limits

The existing composer presentation contract gained one declaration regression;
it failed before the scoped CSS rule and passed after it. The combined image,
action, thumbnail and composer-contract run passed 60 tests in four files. A
declaration check does not prove native geometry; the separate Electron hit-test
and screenshot replay supplies the geometry evidence described above.

The private fixture uses synthetic projects, an isolated profile and a local
mock provider. It does not interact with the owner's running app or history.
The CSS is injected from the exact canonical source rule because shared output
builds are reserved for the packaging lane. Repeat against the new signed
package, including actual split panes, before closing full composer acceptance.
