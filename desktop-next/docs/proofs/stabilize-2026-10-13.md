# Track Z: stabilization of the integration branch (2026-10-13)

Branch `claude/desktop-integration-20261013`. Measured with `cd desktop-next/apps/desktop && npx vitest run --maxWorkers=4` (both projects,
`ui` and `electron`), one run at a time. Baseline = import commit `9e13cd53` in an isolated worktree (removed afterwards); its list is
`baseline-failures.json`.

## 1. Baseline

Re-measured: 14030 tests, **34 failed tests in 15 files, plus 31 files that fail to load** (46 files). The earlier figure of 27 files / 35
tests came from a different layout; the cause here is the same: every entry is environment, not product. Load failures are test files
that read repo-root files this checkout does not have (`scripts/build/*.mjs`, `tests/fixtures/*.json`, `hermes_cli/*.py`,
`pm/lock.json`, the `ws` package). Test failures are `voice-prefs` (2, upstream) and `electron/*` and `scripts/*` tests that shell out to
Python, pwsh or macOS SDKs.

Typecheck baseline: 1 error (`use-session-actions.test.tsx`: missing `tests/fixtures/session-resume-active-turn.json`).

## 2. Failures on the merged tree, and what was decided

First full run on the merged tree: **68 failed tests**, 10 load errors. Decision a = the test asserted behavior a track replaced on
purpose (test updated, reason below); b = real regression (code fixed); c = surface removed, test kept but skipped with the reason inline.

| test | decision | reason |
|---|---|---|
| tool-group: collapses to a summary line naming the work | a | `read_file` runs are now the "file" category: "Read wiring.tsx, ran 1 command" (was "Explored") |
| tool-group: expands to the underlying rows when the summary is clicked | a | same label change |
| tool-group: a file edit among ordinary activity stays visible between the two runs it interrupted | a | the landed edit is the "Edited N files" diff card, not a tool row; order is summary, card, summary |
| tool-group: flat tool list approval surfacing keeps the approval visible | a | approval card primary action is "Allow once" (was "Run") |
| hide-code-diffs: keeps edit counts without code ... | a | counts live on the diff card; no row, no expandable code, in either display mode |
| inline-edit-persistence: write, legacyPatch | a | the diff card is the presentation; the diff body lives in Review changes, so the card carries `+N -M` |
| tool-feed-chrome: answer-only hides non-essential chrome | a | "Allow once" button |
| wiring-background-queue-drain (2); surfaces, surfaces.late-routes, surfaces.app-routes (3 files) | a | mocked `./surfaces` and `@/store/*` lacked `TitlebarSurface` / `VantaTitlebar` dependencies the shell track added |
| statusbar-prefs (2) | a | bottom bar now rests hidden (v3 key); test asserts the new default and that a show persists |
| chat-sidebar.integration: retry, empty state, group labels | a | moved to the Vanta sidebar's copy and groups (project name, Recent) |
| chat-sidebar.integration: Kanban/plugin nav (2), project-scope re-home (2), messaging section (1), messaging owners (2); gateway-groups (1) and gateway-groups-drag (2) | c | Hermes sidebar features the Vanta sidebar does not render (plugin nav rows, project scope, messaging platforms, multi-gateway groups). 10 tests kept as `skip` with the reason inline; un-skip if the shell inventory restores the surface |
| use-statusbar-items: free-tier Sign in chip (2) | a | the Nous Sign in chip was removed; tests now assert no `free-tier` item in any mode |
| thread/index: messageComponents identity | a | `ThreadLiveRegion` reads the assistant-ui store; mocked like its siblings |
| no-native-title | **b** | `queue-panel.tsx` put `title=` on the Steer button; now a `Tip`. The row is split into components, which also brings the file under the size gate |
| use-prompt-actions: reports typed commands to shared metrics | a | usage metrics were removed; the test asserts no metrics call is made while the commands still run |
| floating-panes (2) | a | titlebar is 44; the offset derives from `TITLEBAR_HEIGHT` instead of a literal |
| overlay-completeness | a | ratchet file records the new English-only keys and keys that now fall back to English |
| desktop-install-overlay (6) | a | catalog says "Set up Vanta Desktop", "Restart Vanta Desktop"; install placeholder is `/vanta` |
| find-in-page-scope (2) | a | the rename turned the sample text into "Vanta" but the query stayed `hermes`; the query is `vanta` |
| data.identity (1) | a | `hermes` is the primary profile's reserved @handle (an identifier, not copy); input restored to "Hermes" |
| updates-overlay.manual (1) | a | runs with a feed configured; new test pins the not-configured overlay |
| catalog-completeness: Updates copy in overlay (3: de, es, fr) | **b** | the new `updates.notConfigured` key had no de/es/fr translation; added |
| gateway-choice, providers-settings (4), controls HUD, billing (4), slash-localization, version-details (2), onboarding picker, boot-failure (2) | a | follow the neutral catalog (Nous wording gone, `hey vanta`, "Hosted portal"). Picker and boot-failure also changed behavior, see section 4 |
| hub picker tests (bot skills-hub 14, capabilities, plugins-tab, plugin-catalog, storage-corrupt-notice) | a | embedded hub, catalog feed and docs links are gated behind `VANTA_HUB_ORIGIN` / `VANTA_DOCS_URL`; tests run with a hub origin configured; the bot hub's embedded browser and its Vercel/Pages probe are gone, so its pick and probe tests were replaced by 3 search-only tests |

Typecheck after: `src/app/session/hooks/use-session-actions.test.tsx(112,37): error TS2307: Cannot find module '../../../../../../tests/fixtures/session-resume-active-turn.json'` only, the baseline error.

## 3. Test results per slice (failed / passed, load errors in brackets)

| slice | baseline | merged, before fixes | final |
|---|---|---|---|
| components/assistant-ui | 0 / 740 (0) | 9 / 745 (0) | 0 / 754 (0) |
| app/chat | 0 / 1423 (0) | 14 / 1412 (0) | 0 / 1415 (0) |
| app/vanta | 0 / 0 (0) | 0 / 63 (0) | 0 / 63 (0) |
| app/shell | 0 / 158 (0) | 2 / 156 (0) | 0 / 157 (0) |
| themes | 0 / 136 (0) | 0 / 152 (0) | 0 / 154 (0) |
| i18n | 0 / 77 (0) | 1 / 76 (0) | 0 / 86 (0) |
| store | 2 / 2041 (0) | 4 / 2023 (0) | 2 / 2029 (0) |
| lib | 0 / 1736 (1) | 0 / 1736 (1) | 0 / 1737 (1) |
| api | 0 / 33 (0) | 0 / 140 (0) | 0 / 140 (0) |
| other src (ui) | 0 / 4307 (2) | 6 / 4305 (5) | 0 / 4309 (2) |
| electron | 30 / 3184 (4) | 23 / 3304 (2) | 23 / 3304 (2) |
| scripts | 2 / 124 (23) | 9 / 226 (1) | 9 / 226 (1) |
| e2e | 0 / 3 (1) | 0 / 3 (1) | 0 / 3 (1) |
| **total** | 34 / 13962 (31) | 68 / 14341 (10) | **34 / 14377 (7)**, 46 skipped |

Final: the `ui` project has 0 new failures; its 2 failed tests (`store/voice-prefs`) and 3 load errors (`speech-text.identifier-corpus`,
`relay-deliver-budget`, `use-session-actions`) are baseline. The 12 tests in `electron/channel-build-version` and 7 `scripts/*` files that
show as "new" were load failures in the baseline (missing `scripts/msix-shared.mjs`); with the integration branch's `desktop-next/scripts/`
they load and then fail on the same absent repo-root artifacts (`HERMES_PYTHON`, `pm/lock.json`, `scripts/bundles/desktop_prepare.py`).
Same root cause, environment. Twelve other `electron/*` baseline failures now pass for the same reason (net count 34 = 34).

## 4. DN-11: brand rename and Nous removal

Patch applied with `git apply --3way`; `components/chat/intro-copy.jsonl` was dropped from it (the chat track deleted that file) and four
files the chat and shell tracks rewrote (sidebar `index.tsx`, `assistant-message.tsx`, `intro.tsx`, `use-composer-placeholder.ts`) kept the
integration version with the rename re-applied.

Removed (Nous-specific): Billing settings page and nav entry, credits banner, free-tier notice strip, sign-in dialog host, "share usage
stats" consent strip, Nous terms bar, onboarding free-tier setup notice, statusbar free-tier Sign in chip, Nous Portal API-key group, the
onboarding "Recommended" Nous sign-in row, Nous Cloud portal/Discord recovery buttons, Nous Portal links in pet generation and gateway
settings, theme preset names "Nous" and "Nous Alt" (now "Blue", "Blue Alt").

### Kept by owner rule (generic features, Nous backend neutralized)

The patch had removed three generic surfaces; they are restored with no hosted backend. All endpoints live in `src/lib/vanta-endpoints.ts`,
null by default, so each control still exists and can be wired later.

- Updates overlay and update poller: `VANTA_UPDATE_FEED_URL = null`. With no feed, `checkUpdates` and `startUpdatePoller` set an
  "Updates are not configured for this build" status and never call the update bridge; `applyUpdates` refuses. The overlay renders it.
- Send diagnostics (error-card action, root error fallback, dialog): `VANTA_DIAGNOSTICS_UPLOAD_URL = null`. The dialog says upload is not
  configured and disables Upload; no backend call is made. Support link points at the Vanta repo issues.
- Skills hub and plugin catalog pickers (embedded Hermes docs pages): `VANTA_HUB_ORIGIN = null`; the tabs show "The hub is not configured
  for this build" and no iframe or fetch happens.
- Dead Nous code still on disk (unreachable, listed in the follow-up): `app/settings/billing/**`, `components/free-tier/**`, free-tier and
  shared-metrics stores, `shell/terms-butterbar.tsx`, Nous OAuth flows in `settings/toolset-config-panel.tsx`.

## 5. Brand audit

`rg -i 'hermes|nous'` over `src`, `electron`, `index.html`, `package.json`, match counts by category (`tools` script at
`scratchpad/audit.py`: module paths, URLs, comments, identifiers, quoted sentences, quoted tokens):

| category (non-test src and electron) | before (3474d3fa) | after |
|---|---|---|
| quoted sentences (candidate user-visible text) | 3369 | 425 |
| quoted tokens | 1230 | 1184 |
| identifiers | 2649 | 2595 |
| module paths | 622 | 622 |
| comments | 1622 | 1408 |
| URLs | 92 | 32 |
| css/html/json | 82 | 80 |
| test files (all categories) | 7111 | 6784 |
| **total** | 16777 | **13130** |

Of the 425 remaining quoted sentences, 359 are in `electron/` (the imported Hermes main; not shipped, see below), 9 are French "nous"
(the pronoun), 4 are `src/AGENTS.md`, and the other 53 in `src/` are identifiers: CSS tokens (`--stroke-nous`, `shadow-nous`, `arc-nous`),
IPC and protocol names (`hermes:readFileText`, `hermes-media://`, `/api/hermes/update/check`), `window.__hermesAnnotate`, the `hermes -p`
CLI invocation inside bot prompts and cron commands, and the reserved `hey hermes` stop-word prefixes (kept so the old phrase still matches).

User-visible text: **0**. `src/i18n/brand-free.test.ts` walks the merged catalog of all 9 locales (functions called with probe arguments)
and fails on any Hermes or Nous wording. App name `Vanta` (package `productName`, `<title>`), About, onboarding, updates, errors and
the brand mark are covered by it or by tests listed in section 4. Not done: rendering the 36 wireframe states and grepping their text
(the fixtures harness needs a vite server and Electron; not started per the machine-load rule).

Brand assets: `BrandMark` is the inline Vanta mark; `public/apple-touch-icon.png` (favicon, window icon) and `assets/icon.png` are the
Vanta icon; unreferenced `nous-girl*.png`, `hermes.png`, `hermes-sprite.png` and `hermes-frames/` are removed. Still carrying the old mark:
`assets/icon.icns`, `icon.ico`, `icon-dark.*`, `icon-mac.png`, `assets/appx/*`, `packaging/nous-dmg-2b.tiff` (packaging; regenerate from
`vanta-ts/desktop-app/build/vanta-brand-icon.svg`).

## 6. Network audit

`tools/network-audit.mjs` (runtime net-log audit) is committed unchanged. Run result:

```
Error: Missing .../desktop-next/apps/desktop/dist/electron-main.mjs. Build apps/desktop first.
```

It needs a built renderer and the Hermes Electron main bundle; `scripts/build.mjs` needs repo-root build scripts this checkout lacks.
No runtime audit was possible, so findings are from a source scan of every URL in `src/` and `electron/`.

Started by the renderer without a user action, now removed or gated: Google Fonts CSS for five theme presets (`fontUrl` removed, system
stacks); Hermes docs iframes for the Skills hub and Plugins catalog, and the catalog JSON fetch (gated); the bot skills-hub iframe and its
`HEAD` probe (removed); connector logos from a hosted registry (removed; glyph, favicon or monogram instead).
User-clicked links that named Nous now go to the Vanta docs or repo (docs, release notes, installer, storage recovery).

Still present, all started by the user or by user configuration: GitHub links and the plugin install clone URL (user pastes the repo);
radio plugin (off by default; hits the station, Radio Browser, MusicBrainz and Apple lookup hosts only after Play; User-Agent now says
Vanta); connector product favicons (`ConnectorLogo` fallback); local-model download links (Hugging Face, Ollama); provider key pages
(OpenRouter, OpenAI and others, links only); YouTube embed host. Not changed because it is the imported Hermes main, which Vanta does not
ship (it keeps its own Electron main and the bridge): `electron/bootstrap-runner.ts` downloads from `raw.githubusercontent.com/NousResearch/hermes-agent`,
`electron/portal-session.ts`, `electron/hub-iframe-policy.ts`, `electron/backend-health.ts` (`*.agents.nousresearch.com`),
`electron/remote-lifecycle.ts` (install one-liner), `electron/main.ts` appId `com.nousresearch.hermes`.

## 7. Identifier-rename follow-up (not done; the bridge and gateway depend on these)

Counts are token matches in `src/`, `electron/`, `e2e/`, `scripts/`.

| step | what | count | mechanical plan |
|---|---|---|---|
| 1 | `window.hermesDesktop` and preload key | 1524 | one codemod on the token `hermesDesktop` in renderer, preload, `global.d.ts`, tests; the bridge track exposes `vantaDesktop` and keeps `hermesDesktop` as an alias for one release |
| 2 | `hermes:` IPC channels | 794 | rename the prefix in `ipcMain.handle/on`, preload and renderer in one commit, checked against `docs/ipc-surface-2026-10-13.md`; the bridge facade is the single source of names |
| 3 | `@hermes/shared`, `@hermes/plugin-sdk`, `@nous-research/ui` | 306, 235, 3 | rename workspace package names, tsconfig and vite aliases, imports; replace `@nous-research/ui` (3 uses) with a local copy or `@vanta/ui` after a license check |
| 4 | `hermes://` and `hermes-media://` | 104 | register `vanta://` and `vanta-media://` in Vanta's main; keep the old scheme handler for one release |
| 5 | `HERMES_*` environment variables | 1239 | read `VANTA_DESKTOP_*` first, fall back to `HERMES_*`; rename scripts and docs |
| 6 | localStorage keys `hermes.*`, `hermes-*` | 1199 | copy old to new key once on startup, then drop the old key |
| 7 | `Hermes*` types and `*Hermes*` functions, `hermes.ts`, `plugins/hermes-bots` | 853, 1085 | ts-morph or the TS language service rename (symbols first, then file names), last because it touches the most files |
| 8 | CSS tokens `--stroke-nous`, `shadow-nous`, `arc-nous` | 43 | rename in `styles/*` and components together |
| 9 | i18n key names `nousAuth*`, `titleNous`, `updateHermes`, `sshHermes*`, `connectorsPage...nousLine` | 355 incl. ids | rename with step 10, then regenerate `overlay-gaps.json` |
| 10 | delete the dead Nous code listed in section 4 | n/a | remove components, stores and their tests together; `rg -i nous` should then show only provider ids |
| 11 | packaging identity: appId, `hermes` scheme, icons, dmg background | n/a | after the Electron main decision; regenerate icons from the Vanta brand icon |

Each step ends with `rg -c` for its token at 0 (or only the documented alias), the typecheck at the one baseline error, the `ui` project
at its baseline failures, and the bridge smoke. Keep `LICENSE-HERMES-MIT` and `NOTICE.md`.

## 8. Not fixed

- Baseline failures (34 tests, 7 load errors) are environment; none belongs to this branch.
- 10 sidebar tests are skipped (section 2, decision c) pending the shell control inventory.
- Runtime network audit and wireframe-state text grep could not run (section 5 and 6).
- Packaging icons and the Hermes Electron main identity (section 5 and 6).
