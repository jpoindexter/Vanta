# Codex shipped design reference — bounded static extraction

## Verdict and scope

The bundle at `/Applications/ChatGPT.app/Contents/Resources/app.asar` identifies itself as **Codex**, package `openai-codex-electron` version `26.1021.31345`. Its SHA256 is `130145706a912db74e4d260ad7538f10f1e05e88af955f9afba42cdf01e64606`. This is not separate evidence for the ChatGPT product.

All **375 CSS entries** have a hash, size, category and explicit curation inclusion/exclusion reason in `css-inventory.json`. Every file now has complete inert CSS-syntax parsing in the **private** `all-css-private-reference.json`: **51,442 declarations, 22,491 selectors, 3,466 at-rules, 8,851 custom-property declarations and 2,346 state-bearing selectors; zero parse failures**. Exact source locations and enclosing selector/layer/media/support/keyframe contexts remain intact.

The reusable core workflow curation stays separate: **41 CSS files**, 2,388 scoped custom-property declarations, 3,069 component rules and 390 state-bearing selectors. The other 334 files are included in the private broad supplement, not normalized into Vanta's reference palette. Shared/initial/primary styles contain multiple product/platform branches. Their presence does not mean a branch is active. Inclusion/exclusion now means **curation**, not whether source syntax was inspected.

REA parsed four exact inventoried JS entries as inert syntax: early bootstrap, theme selection, floating navigation rail and home/thread chrome content. No target JavaScript executed. Parent Evidence: `ev_25f2437d6ae1b9c81c04580a04e617ad5d975e97b12149a459c2c38662e84394`; summary: `ev_fcec967a7cb27a1e87a826da192be0803e7dc046b5fde58ef0679b969e793de7`. Four files/7,917 bytes/zero parse failures; 16,946 unselected source files remain unknown. See `rea-summary.json`.

**Not a full runtime extraction:** current DOM, computed cascade, hover/focus rendering, AX semantics, native shadow, dimensions at the user's zoom, startup timing and current theme selection are unobserved. UI access was safety-refused; no alternate native/runtime route was attempted. No application code, icons, fonts or other assets were copied into Vanta.

## Reusable design facts

All values below are **observed static declarations/default objects**, not measured screenshots or current computed values. File hashes and exact selectors/zero-based UTF-16 source offsets accompany each raw record. DTCG-like normalization is separate from raw values and does not flatten scopes.

| Dimension | Static reference | Limits / application to Vanta |
| --- | --- | --- |
| Desktop neutral palette | Desktop defaults: light surface `#ffffff`, ink `#1a1c1f`; dark surface `#181818`, ink `#ffffff`; accent `#339cff`. `opaqueWindows:false`. | Browser/ChatGPT default object differs (`#fcfcfc`, `#0d0d0d`, `#3a83f7`, opaque). Keep these separate; retain Vanta brand accent. Runtime theme derivation/overrides unknown. |
| Typography | Root type tokens: 11, 12, 14, 16, 28px; normal/medium/semibold/bold 400/500/600/700. System sans stack. Chat size has fallback `var(--font-ui-size,13px)`, plus user override. | Do not mistake generic 14px base for guaranteed chat size. Use one coherent Vanta scale, not a per-screen literal patch. Fonts were not extracted. |
| Spacing | Base `.25rem`; repeated composer values use 2, 2.5, 3, 5, 7 and 11 multiples. | 4px interpretation assumes a 16px rem root; not observed. Keep raw rem values in normalization. |
| Radius | Base ramp `.25/.375/.5/.625/.75/1/1.25/1.5rem`, full `9999px`; `--corner-radius-scale:1`. | Composer base and browser overrides differ. Do not set every menu/button to composer radius. |
| Elevation | Card reference `0px 4px 16px 0px #0000000d`; composer uses three subtle layers (hairline, near shadow, broad ambient shadow), with narrower-screen broad blur 40px versus 80px default. | Depth is on surfaces, not dark borders on every button. Native OS outer-window shadow is not CSS-measured here. |
| Titlebar/shell | Shared toolbar token 46px. Primary shell separates sidebar, main surface and window/backdrop handling. Responsive sidebar has separate open/peeking/closed rules. | A 46px token is not a whole window titlebar measurement. Preserve native controls and drag/non-drag areas. |
| Sidebar | Peeking sidebar rule combines a hairline and card shadow; full-height/page layouts have separate surface/radius rules. Sidebar row horizontal padding has 8px declarations. | Do not assume peeking-popover shadow is a permanent pinned-sidebar shadow. Floating navigation rail is transcript navigation, not the project sidebar. |
| Composer | Separate root, input, attachment and footer anatomy; compact/comfortable density; default/opaque/inline/secondary/document surface variants. Inline intentionally removes surface shadow. | Place attachment/model/access/voice actions in one footer; avoid child outlines duplicating outer surface focus. Do not copy unrelated surface variants wholesale. |
| Transcript | Conversation/turn style branches are separate from shell and composer. Typography supports prose, captions, tool rows and user-message surfaces. | Current DOM/rendered message spacing unobserved; shared rules include other product branches. Preserve Vanta streaming, approval and tool evidence behaviors. |
| Menus and cards | Dedicated popover, tooltip, hover-card, title-menu, control-dialog, dialog-shell and settings row styles; surface and typography use semantic tokens. | Hover card is not the same component as tooltip; dialog is not a full-screen loading overlay. Keep keyboard semantics in shared primitives. |
| Search/settings/approval | Complete CSS file inventory includes search, setup/settings, dialog, action, permission-card and tab entries; shared core rules also contain these selectors. | Presence is not feature/runtime parity. Source-only extraction does not establish accessibility, focus return, error recovery or actual navigation. |
| Motion/responsive/scroll | Raw rule records retain media, support, layer and nested selector contexts, including reduced-motion branches. | Do not normalize away media/support guards. Scrollbar/motion rules may reside in shared styles; current OS overlay-scrollbar behavior unobserved. |

## State and accessibility evidence

`Button-26a9ec0e398b.css` (SHA `f6bbc05544fa15500109b19e53be3221b9b1854b70019dc5849f7e072fedcfc8`) declares a 2px `:focus-visible:after` outline with a default 2px offset at UTF-16 offset 2016. Disabled variant rules at offset 25962 set disabled background/border/text tokens and `cursor:not-allowed`; relaxed tone changes the cursor. Ghost hover rules are guarded by hover-capable/fine-pointer media conditions and exclude disabled controls.

The 390 curated state-selector records and 2,346 broad state-selector records are **syntax inventory**, not verified states. A selector containing `:not([data-disabled])` is explicitly not proof of a disabled appearance. State polarity, cascade, dynamic attributes, keyboard use, focus restoration, forced colors and actual screen-reader behavior require Vanta's own acceptance.

Opaque literal-pair contrast checks in `contrast-reference.json`: desktop default light 17.076:1; desktop default dark 17.756:1; generic secondary `#5d5d5d` on white 6.585:1. Generic tertiary `#8f8f8f` on white is **3.234:1**, failing AA small text. That generic branch must not be blindly copied for 11–14px labels. Current computed theme and translucent surfaces are not evaluated; focus-ring contrast is unknown until its semantic token resolves.

## Startup/window loading boundary

Read-only static review additionally examined `.vite/build/bootstrap-CoL4UX0u.js` (SHA `74030b5da54e74b19317bf018a431c81bb627ae61930e6b98e8ec1cd37fff8d1`) and `.vite/build/main-0FVbxCQU.js` (SHA `fad45aa7d81de6fe166704e8879e3b7cbfc85151e72df7946853336c7cbc5a3c`).

- Main window creation starts near UTF-16 offset 4970528; `show` defaults true, the shell BrowserWindow uses its background/backdrop configuration, and packaged content loads through the app URL near 4981100.
- `ready-to-show` listeners near 4975219 log timing; that listener is not a branded dwell timer.
- A **Windows-only fallback** around 4999470 shows an unexpectedly still-hidden primary window after the 2,000ms `hSt` threshold (constant near 4995099), with cancellation on show/close. This is a maximum-wait escape, not minimum branding dwell. It is not a macOS rule.
- A separate 420×176 non-closable installer progress window occurs near bootstrap offset 581136. It must not be confused with ordinary chat startup.
- No minimum branded dwell was identified in these audited window-creation paths. This is not proof that all renderer-loading branches lack overlays. Ordinary startup visibility timing, renderer readiness and failure appearance remain unobserved.

For Vanta, the defensible design target is: usable chat shell first, connection status inline, recoverable retry/error affordance, no minimum branding delay. Never hide a failed policy/runtime behind a spinner or label a queued/running workflow Done.

## Exact Vanta refinement map — proposals, not edits

Paths below are repository-relative and were read-only verified to exist. Integration remains separately verified.

| Seam | Existing Vanta owner | Scoped next refinement |
| --- | --- | --- |
| Shared palette/elevation/type | `desktop-next/apps/desktop/src/styles/vanta.css`; `src/themes/context.tsx` | Keep semantic seeds, make composer/menu/sidebar depth distinct, retain Vanta accent and AA-small-text correction. Do not import the reference token file as a theme. |
| Sidebar/navigation | `desktop-next/apps/desktop/src/styles/vanta-sidebar.css`; `src/styles/vanta-shell.css` | Match density and hierarchy through `--vs-*` metrics; separate pinned row state, hover actions, peeking overlay and collapsed rail; do not create per-row borders. |
| Composer | `desktop-next/apps/desktop/src/styles/vanta-composer.css`; `src/app/chat/composer/floating-surface.tsx` | One opaque typing surface; shared `--shadow-composer`/`--radius-composer`; one visible focus cue; quiet footer actions with their own keyboard rings. |
| Menus/dialogs | `src/components/ui/button.tsx`, `popover.tsx`, `dropdown-menu.tsx`, `tooltip.tsx`; `src/styles/vanta-overlays.css` | Refine shared primitives once: opaque elevation, readable row type, restrained stroke, keyboard/focus/disabled behavior. Preserve forced-colors affordances. |
| Transcript | `src/styles/vanta-chat.css`; `src/app/chat` and session transcript seams | Consistent message measure, compact collapsed activity and distinct status states; preserve streaming/cancel/approval/resume contracts. |
| Titlebar/status | `src/app/shell/vanta/vanta-titlebar.tsx`; `src/app/shell/statusbar-controls.tsx` | Quiet chrome, task title first, advanced runtime detail behind intentional disclosure; keep native window controls and shortcuts. |
| Startup | `src/components/gateway-connecting-overlay` seam (parent track) | Keep the shell reachable while reconnecting; status banner rather than branded blocker. Explicit retry/failure state and no artificial delay. |

## Files and proof

Compact distribution candidates: `DESIGN-REFERENCE.md`, `tokens-normalized.json`, `theme-reference.json`, `contrast-reference.json`, `css-inventory.json`, `verification.json`, `all-css-verification.json`, `rea-summary.json`. **Keep both `design-reference.json` and `all-css-private-reference.json` private**: they contain source-specific declaration/selector reference evidence. Do not transplant those selectors or implementation into Vanta.

`verify.cjs` re-read every CSS entry hash and verified 5,847 curated source offsets (2,388 token, 3,069 component, 390 state). `expand-all-css.cjs` additionally parsed all 375 CSS entries and verified **77,399 source offsets**: every declaration, selector and at-rule location; all 375 source hashes matched. These checks validate reference identity/locations, not visual reproduction. `normalize.cjs` ran the literal contrast checks; its normalized core remains unchanged by the broad expansion. No app launch, code execution from the target, credentials, owner profile, shared source edits, commits or pushes occurred.

Remaining proof: parent-owned Vanta screenshot comparison at the same viewport/zoom, actual hover/focus/disabled/keyboard checks, 200% zoom/narrow layout, dark/light/forced-colors contrast, native window shadow, ordinary startup/reconnect/error paths, and unfamiliar-user acceptance. REA reported seven unpacked native companion hash contradictions; these remain untrusted and were not analyzed or dismissed as harmless.
