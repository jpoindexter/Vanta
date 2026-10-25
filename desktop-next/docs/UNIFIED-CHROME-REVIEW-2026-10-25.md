# Unified sidebar/titlebar — real-app review candidate

## Status and authority

**Review only. Not applied to the integration application's source or installed
app.** The owner approved the composer, requested one unified design, and retains
per-surface visual acceptance. This is the next sidebar/titlebar candidate under
DN-29, not whole-app design acceptance or another replacement shell.

Candidate: exact archived source `7a10513c` plus
[the seven-file review patch](design-proposals/unified-chrome-2026-10-25.patch).
It changes three stylesheets, two existing titlebar callers, the shared Button's
glyph selector and one colocated regression test: 66 insertions, 10 deletions.
Patch SHA-256:
`045d564a55ba121c87a3938f899661c7c93370dcb46b16f359a1f9c1d0e4bbc8`.

## What is unified

- The titlebar reads the sidebar's existing neutral surface, while the chat
  canvas keeps its original white/light and near-black/dark surfaces.
- Six hand-styled titlebar controls now use the existing `Button`, `ghost`,
  `icon-titlebar` variant. Their handlers, accessible labels, test hooks,
  tooltips, menu ownership and pressed state remain intact.
- The Vanta skin's existing control roles now give seven chrome controls a
  common 32px target and 18px glyph. No new component family or theme provider.
- Sidebar text aliases the existing type roles; navigation uses the same
  14/20 label rhythm as the composer. Insets reuse the established scale,
  selected rows use medium emphasis, and New chat has primary text emphasis.
- The native 44px drag band, 275px sidebar, approved 22px composer radius,
  sidebar edge depth, stored appearance preferences and underlying navigation
  remain. This patch does not add a new icon rail or change the window frame.

Default values for other saved skins are not overridden by the Vanta-specific
chrome aliases. The Button selector correction honors each skin's existing
icon-size variable; complete alternate-skin visual acceptance was not run.

## Executed evidence

The actual Vite renderer and Electron main/preload were built from the isolated
candidate. Existing local dependency trees were reused; no dependency install,
global configuration, owner profile or live provider was involved. The validated
precompiled runtime is reused because its production source is byte-identical
between `71cf90cf` and this candidate's base. The existing approved kernel binary
is linked only into the candidate's expected development path; no Rust edit.

1. Baseline: 12 real Electron checks, one loopback scripted-model request,
   zero renderer errors.
2. Final candidate: 21 real Electron checks, one loopback request, zero renderer
   errors. Covers chat response, retained draft, shared painted surfaces,
   canvas isolation, control geometry, actual shared Button markers, keyboard
   menu/Escape focus return, session actions, Files action/pressed state,
   forced-colors state, 800px drawer and persisted dark appearance.
3. Separate final narrow replay: all seven 32px controls with 18px glyphs fit
   inside the 800px-wide, 44px-high titlebar; a 2px keyboard ring remains.
   Zero model requests and renderer errors in that replay.
4. The Button regression fails before its selector correction: two differently
   quoted SVG selectors survive class merging and the default 14px rule wins.
   The corrected primitive retains only the role's winning rule. All three
   default/xs/titlebar cases pass after correction; actual Electron measurements
   independently confirm 18px glyphs in the final candidate.
5. Final focused tests: 25 passed in four files (Button ownership, composer
   contract, design guard and existing titlebar controls). Renderer typecheck
   exits zero. Final production renderer/main/preload build exits zero.
6. `git apply --unidiff-zero --check` accepts the zero-context review patch
   without applying it. All 239
   pre-existing dirty regular files remain hash-identical. No production source
   or installed-app change is claimed by that dry run.

## Retained failures, not hidden fixes

The initial source launch omitted the kernel's expected development path. The
launcher derives that path and overrides a supplied kernel env value; supplying
the expected link in the isolated snapshot corrected the fixture, not production.
An initial build invocation also used the wrong directory and was corrected.

The old visual mock routes research wording into a tool-loop scenario and hit
the iteration limit. The proof switched to the existing delivery scripted-model
harness; the agent loop and its limits were not weakened.

An intermediate chrome-token change washed the whole conversation canvas grey.
That candidate was rejected. The final patch scopes only the titlebar paint;
explicit light/dark canvas comparisons now preserve the baseline surfaces.
The earlier 14px glyph captures and all failed/intermediate evidence remain.

## Review and re-entry

Durable external source, scripts, logs, JSON reports and before/after captures:
`Vanta-backups/unified-chrome-review-20261025-6RvyzO/` beside the checkout.
Final captures include `after-conversation-light.png`, `after-menu-light.png`,
`after-sidebar-menu-light.png`, `after-home-dark.png`, `after-menu-dark.png`,
`after-forced-colors.png` and `after-narrow-controls.png`. The conversation
capture shows the existing editor's keyboard-focus ring, not a resting border.

Obtain owner review of this surface before applying the patch to production.
Then run its narrow actual-app path, retain the approved visual comparison,
and deliver the exact signed/notarized installed candidate with rollback.
Do not interpret this candidate as authorization for other surfaces, a new
Astryx overlay stack, a main merge, public release/tag, CI or paid services.

Not checked: whole-app visual parity, all custom layouts/skins, native window
shadow/physical pointer behavior, full contrast or audible assistive technology,
normal-profile/live-account behavior, fresh packaging or installed acceptance.
The existing font/chunk build warnings remain. The broader design, continuity,
dependency/security, owner and human acceptance gates stay open.
