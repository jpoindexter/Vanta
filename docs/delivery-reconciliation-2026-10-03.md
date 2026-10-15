# Delivery reconciliation — October 3, 2026

Outcome: one ordinary Vanta agent with a dependable, low-friction Desktop,
shared CLI/TUI capabilities, observable results and scoped authority. Not a demo
edition or replacement engine. Jason owns priority and acceptance decisions.

## Observed baseline

- Feature branch: `codex/librechat-shell-adapter-20261002` at
  `d2be37c38256bc93c44bd4b6a4abe6cf6c6351c6`, clean and 0/0 with its remote.
- Refreshed `origin/main`: `4911ae44bbb35beef4511ba298475ba5a82b7e1c`.
  Feature branch is 118 commits ahead / 0 behind before this documentation commit.
- GitHub: 32 open PRs, comprising 13 drafts and 19 Dependabot PRs. PR #60 is
  stacked on #59; neither is merged. No PR was closed or merged by this audit.
- Separate dependency PR #56: `5abbb6490d982cb048c80d1f90c1c2b3d3e2efa4`,
  review required. Its September 30 clean-lock evidence is historical, not proof
  for today's installed feature stack or today's advisories.
- Live default-branch alerts: 133 (69 high, 53 moderate, 11 low). Actions disabled.
- Installed Desktop hash matches the tested dictation package; installed CLI
  contains the same implementation. See [exact evidence](local-dictation-2026-10-03.md).

## Canonical order and capacity

`roadmap.json` remains the only work database. Inventory is 1,363 records:
1,288 retained shipped records, 1 Building, 4 Next, 7 Horizon, 63 Parked.
These historical shipped records are not a product-completion percentage.
No status, acceptance contract, dependency or shipped evidence is changed here.

| Lane | Current sequence | Exit evidence |
| --- | --- | --- |
| Now — everyday Desktop | Continue `DESKTOP-OPERATOR-DOSSIER-HIERARCHY`: normal-profile remembered routine approval across another chat/restart; stop/switch/resume; research → cited file → reopen | Exact installed user path; no duplicate work, lost drafts or repeated eligible approval |
| Trust / integration gate | Reconcile separate dependency PR #56 with the feature stack in isolation; retain canonical Git-probe, instruction-write and local-state Next order | Current lock audits plus affected runtime/package checks; no old snapshot replacing feature work |
| Next — useful actions | `BROWSER-WORKFLOW-ACTION-BOUNDARY`: scoped browser/native action → observed result → saved output | Real authorized observe/act/readback/Stop; launching an app alone is insufficient |
| Later — fuller voice | `VOICE-LOCAL-MODELS-AND-PROVIDERS`: physical mic, managed free model downloads and interruptible output | User-triggered local capture and output, download integrity/cancel; hosted proof separately authorized |

The canonical generated build order retains four Next cards in this order:
Git probes, protected instruction writes, local state recovery, browser action
boundary. Their recorded dependencies are shipped; this means dependency-ready,
not implemented or free of risk. Desktop remains the single Building card.
Do not start a third lane or promote whole cards on the basis of subfeature tests.

All 12 open canonical cards must appear on the scoped Trello board in canonical
order. Four existing Horizon cards were absent: capability-grounded prompt,
TRUST-03, TRUST-05 and TRUST-06. Adding their mirrors creates no new roadmap
commitment and does not start those deferred implementations. Selected parked
cards remain visible; Trello is not a duplicate of all 1,363 historical records.

## Implemented versus remaining

Installed increments include chat-first/light presentation, compact tool details,
model settings, Mini/full continuity, approval-policy clarity, bounded native app
launch and draft-only local dictation with keyboard access. Each has dated,
bounded evidence; earlier package receipts do not certify the newest package.

Still open: full normal-profile approval continuity; click/type/observe native
work; fresh installed research-to-document acceptance; coherent Connections,
background follow-through and result recovery; dependency integration; voice
model manager/TTS and physical input; the deliberately deferred unfamiliar-person
test. No blanket "all features work" or "security green" claim is supported.

## Changes made by this reconciliation

- Refresh the active Desktop card's installation and voice evidence.
- Repair the stale strategy-level dependency-clean statement.
- Put current evidence above the historical product-acceptance checkpoint.
- Refresh Trello overview/Desktop mirrors; add four missing existing Horizon
  mirrors and align Next/Later order with generated canonical order.
- Regenerate roadmap views and check schema, IDs, dependency graph/cycles, WIP
  limits, all shipped records and all mirrored-card statuses. No app code changed.

## Re-entry and review rule

Refresh Git and installed identity, then execute the smallest normal-profile
approval/restart slice within already authorized scope. Capture the exact
remaining failure before changing code. In the separate integration lane, compare
PR #56 against current locks before installing dependencies or changing a package.
Only affected tests and the actual changed path are required; no automatic full
suite, paid workflow, merge, release, tag, account mutation or permission expansion.

Review after each installed increment or demonstrated regression. Correct stale
mirrors immediately; do not enlarge the feature backlog to substitute for proof.
GROW-01, paid work, outreach and unfamiliar-person testing remain deferred.

## Reconciliation verification

| Executed check | Result |
| --- | --- |
| `node scripts/build-order.mjs` | Exit 0; 12 open; unique IDs, existing dependencies and no cycles |
| `node scripts/roadmap-current-projection.mjs` and `--check` | Exit 0; generated current section matches; historical narrative retained |
| `node vanta-website/scripts/gen-roadmap.mjs` | Exit 0; public projection regenerated locally, not deployed |
| `node --test scripts/build-order.test.mjs scripts/roadmap-current-projection.test.mjs` | Exit 0; 7 passed |
| `buildRoadmap(repoRoot)` through `node --import tsx` in `vanta-ts` | Exit 0; canonical schema accepted and ignored local HTML regenerated |
| Canonical before/after assertion | All 1,363 IDs, statuses, dependencies and Done contracts unchanged; 1,288 shipped records unchanged; only active Desktop date/notes updated |
| Trello full-board readback | 25 cards: overview plus 24 canonical mirrors; all 12 open present once, Next/Later order matches, mirrored statuses match |
| Scope and whitespace | Documentation/roadmap only; `git diff --check` clean |

Trello readback: [overview](https://trello.com/c/lI8Cirrr),
[active Desktop](https://trello.com/c/rs0TKKe3). Four existing Horizon mirrors
were added; no canonical cards were added or promoted. App tests and packaging
were not rerun for this documentation-only change. These checks establish
tracking consistency, not new product acceptance.
