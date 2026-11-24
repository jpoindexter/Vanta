# Wireframe parity harness

Measures how closely the built app matches `docs/wireframe/vanta-desktop-wireframe.html`.
"100%" = 0 FAIL and 0 UNMAPPED rows (ALLOWED rows are declared deviations, always listed).

```
npm run parity:build       # renderer + Electron main WITH the state fixtures (VITE_SHELL_FIXTURES=1); parity needs this build
npm run parity:spec        # re-extract wireframe-spec.json + copy-inventory.json (36 states, ~20 s)
npm run parity             # check the fixtures build in a sandboxed hidden Electron (~2.5 min); writes report.md/json
npm run parity -- --desktop-root <path to built apps/desktop> --only w1440.chat-empty --allow-unmapped
node tools/parity/check-app.mjs --url http://localhost:5173    # any URL instead of Electron
npm run parity:selftest    # determinism + wireframe-vs-itself + 3 negative tests; writes evidence/
npm run parity:test        # unit tests for the comparator
```

Proofs: `node tools/parity/proofs.mjs [--only <state>]` writes wireframe | built side-by-side JPEGs to `docs/proofs/parity/`;
`node tools/parity/dom-outline.mjs --state <id> --root "<css>[;<css>]" [--box] | --eval "<js>"` prints the built app's DOM (or any expression) in a state.

Files: `selector-map.json` (wireframe selectors + state drivers), `app-selector-map.json` (the app's),
`wireframe-spec.json` (generated), `copy-inventory.json` (generated), `allowed-deviations.json`, `report.*`.

## Adding app entries (tracks U, V, W)
`app-selector-map.json` has the same role keys as `selector-map.json`. Replace `"UNMAPPED"` with a locator
(prefer `testId`, then `role`+`name`, then `css`; `within` scopes to another mapped key). Keys ending `[]` are lists.
```json
"card.approval.allowOnce": { "testId": "approval-allow-once", "within": "card.approval", "hug": true }
```
Optional per entry: `textMode` (`all`|`own`|`none`), `tol` (`{"w": 2, "x": "5%"}`, px or % of the wireframe value),
`hoverOnly`, `note`. Do not loosen `tol` to hide a gap; unmapped is honest, a wide tolerance is not.

Drivers put the app in a state, one per facet (`chat:waiting`, `wb:changes`, `view:home`, `overlay:palette`,
`theme:dark`, `drawer:open`, `extra:...`; see `states.mjs`). Steps: `click`, `fill`+`value`, `press`, `hover`,
`goto` (`${url}`), `reload`, `storage`, `waitFor`, `wait`, `eval` (a JS expression in the page).
A state with any facet lacking a driver reports UNMAPPED. Window width is set by the harness (`w:` drivers not needed).

### How the app is put in a state
A fixtures build (`VITE_SHELL_FIXTURES`) exposes `window.__vantaFixture(spec)` (`src/dev/shell-fixture-driver.ts`). It seeds the six
wireframe chats, the focused chat's thread, prompts and model into the real stores (`src/dev/shell-fixtures.ts`), so the real
titlebar, sidebar, thread, composer and banner render them. The pages, workbench, palette and settings sheet are not yet mounted
in the live window; the fixtures build draws them inside the real shell (`src/dev/shell-fixture-host.tsx`, mounted by
`ChatRoutesSurface` only in that build). Their rows are measured in the real shell, but this proves layout, not that a user can open them.
The saved-rule toast driver (`extra:toastAlways`) calls the fixture, not the click; the click path is covered by `approval.test.tsx`.

### Declaring a difference (`allowed-deviations.json`)
Every entry has an `id`, a written `reason`, `props`, optional `keys` and `states` globs (`*`), and a `transform`:
`ignore` (any value passes), `stripGlyphs` (only the icon glyphs differ), or `shift` (the app equals the wireframe value plus
the entry's `shift.<prop>` px; a different offset still FAILs). Extra fields: `na: true` marks a wireframe element with no counterpart
(its key needs no locator; rows are ALLOWED), and `copy: [strings]` lists wireframe strings declared absent (not counted as missing).
Prefer `shift` to `ignore` when a kept feature moves things by a constant.

Copy is compared per state: a wireframe string is found when the app shows it as one string, or as a run of adjacent text pieces
(a sentence split by inline links). Spinner frame strips are not text (`textIgnore` in the app map).

## What it cannot prove
Hover/focus/pressed states, animation and timing, real fonts (text widths differ, so `hug`/`flow` keys have wider
tolerances: ~12% width, 24 px x), color (only filled vs not; hue is an allowed deviation), icon shapes, scroll
position and long content, drag/resize, behavior after interaction, anything the wireframe does not draw.
Passing means "matches the drawn structure and copy at the sampled states, under the declared deviations", not "feels right".
Read ALLOWED as "declared", not as "equal": `report.md` lists each deviation with its row count.
