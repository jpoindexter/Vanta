# Wireframe parity harness

Measures how closely the built app matches `docs/wireframe/vanta-desktop-wireframe.html`.
"100%" = 0 FAIL and 0 UNMAPPED rows (ALLOWED rows are declared deviations, always listed).

```
npm run parity:spec        # re-extract wireframe-spec.json + copy-inventory.json (36 states, ~20 s)
npm run parity             # check the built app (isolated mock Electron); writes report.md/json
npm run parity -- --desktop-root <path to built apps/desktop> --only w1440.chat-empty --allow-unmapped
node tools/parity/check-app.mjs --url http://localhost:5173    # any URL instead of Electron
npm run parity:selftest    # determinism + wireframe-vs-itself + 3 negative tests; writes evidence/
npm run parity:test        # unit tests for the comparator
```

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
`goto` (`${url}`), `reload`, `storage`, `waitFor`, `wait`. A fixtures route is one `goto` step.
A state with any facet lacking a driver reports UNMAPPED. Window width is set by the harness (`w:` drivers not needed).

## What it cannot prove
Hover/focus/pressed states, animation and timing, real fonts (text widths differ, so `hug`/`flow` keys have wider
tolerances: ~12% width, 24 px x), color (only filled vs not; hue is an allowed deviation), icon shapes, scroll
position and long content, drag/resize, behavior after interaction, anything the wireframe does not draw.
Passing means "matches the drawn structure and copy at the sampled states", not "feels right".
