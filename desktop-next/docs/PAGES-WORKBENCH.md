# Pages, workbench, palette and settings (Track W)

Source of truth: the approved wireframe (`docs/wireframe/vanta-desktop-wireframe.html`). Code lives in
`apps/desktop/src/app/vanta/`, styles in `apps/desktop/src/styles/vanta-{pages,composer,workbench,overlays}.css`
(all scoped under `.vp`, colours are `--dt-*` theme tokens).

## Contracts (props in, intents out; no gateway, store or Electron knowledge)
`types.ts` is the whole surface: `HomeProps`, `ListPageProps`, `WorkbenchProps`, `PaletteProps`, `SettingsProps`.
Every data block is `BlockState<T>` / `TabState<T>` (`loading | error | ready`), so skeleton, error-with-Retry and
empty render per block. Live surfaces (browser webview, xterm) mount through `WorkbenchProps.slots`.
The shell supplies `mode` (`workbenchModeFor(width)` / `useWorkbenchMode()`), a scroll container for pages
(`.vp-scroll`), and a positioned ancestor whose top edge is the titlebar for overlays (`--vp-titlebar`, 44px).
`adapters/cron-rows.ts` maps the existing Hermes `CronJob` store onto Schedules rows; other pages are fed by
the gateway track later.

## Proof tooling (`desktop-next/tools/`)
- `npx vite --port 5291` in `apps/desktop`, then open `/vanta-fixtures.html?screen=home&state=ready&w=1440&theme=dark`
  (screens: home, schedules, connections, skills, outputs, workbench&tab=, palette, settings&section=).
- `node tools/parity-pages.mjs` wireframe-vs-build table to `docs/proofs/pages/parity.md`.
- `node tools/shoot-pages.mjs` every screen and state at 1440/1100/800, light and dark.
- `node tools/parity-pages-run.mjs [--spec <spec>] [--copy <copy-inventory>]` runs the shared checker (`tools/parity/`) against the harness (`?bare=1`, viewport = frame) for this track's 50 role keys.
- `node tools/drive-pages.mjs` drives each control in a real browser and checks focus, 12px floor, contrast, reduced motion.

## Deliberate deviations from the wireframe
Allowed: Tabler icons for text glyphs; theme tokens for colour (violet only on focus, links, send); native window controls.
Also, each flagged for owner decision:
1. Wireframe `.code` has no `white-space:pre`, collapsing multi-line diffs/terminal output; built keeps line breaks.
2. Wireframe `.w1100 .badge{display:none}` and `.w1100 .nav{padding:0}` target the sidebar rail but also hit Home's
   Needs-you badge and the Settings nav; built keeps both visible.
3. Tertiary grey is mixed darker (wireframe 3.6:1 on white; built >= 4.5:1).
4. Page titles keep the wireframe's UA bold (700) although DESIGN-VANTA says weights 400/500/600.
5. Home project picker is a native select (width matches; 9px more right padding for its chevron).
6. Palette shows no group headers (the wireframe list is flat); `PaletteCommand.group` only orders.
7. Settings Models, Permissions, Voice and Appearance are not drawn in the wireframe; they reuse its row treatment.
8. Focus indication is added (violet 2px outline; palette input gets a 2px underline); the wireframe's palette input has none.

## Shared parity checker notes
- Test ids (`data-testid`) on every mapped element; `docs/parity/app-selector-map.json` maps the 50 keys and the `wb:`, `view:`, `overlay:` drivers to the fixtures route.
- `docs/parity/wireframe-spec.json` was extracted from the raw wireframe file, which has no doctype and renders in quirks mode
  (two-line rows 54.69px). The published artifact is wrapped in `<!doctype html>` (standards mode, rows 57.59px). Regenerate the
  spec from a doctype-wrapped copy before judging any track against it.
- Declared deviations added to `docs/parity/allowed-deviations.json` (ids `w-*`) and listed above. Visibility is not deviation-able:
  Home's Needs-you badge at 1100 is the one honest FAIL (the wireframe hides it by an accidental rail rule).
