# Wireframe parity report

Target: electron /Users/jasonpoindexter/Documents/GitHub/docs/Vanta-restore-shell-20261013/desktop-next/apps/desktop. Wireframe sha256 ef50e2478569, 36 states. Verdict: **NOT AT PARITY**.

| Measure | Value |
| --- | --- |
| Rows (element x state) | 6758: 106 PASS, 33 ALLOWED, 38 FAIL, 6581 UNMAPPED |
| Parity (PASS + ALLOWED) / all rows | 2.1% |
| Role keys | 160: 77 mapped, 145 unmapped; of mapped, 0 pass, 15 fail |
| States | 3 of 36 drivable in the app |
| Copy | 110 of 2889 wireframe strings found (3.8%); state rows: 0 PASS, 0 ALLOWED, 3 FAIL, 33 UNMAPPED |

## By state

| State | PASS | ALLOWED | FAIL | UNMAPPED | Note |
| --- | --- | --- | --- | --- | --- |
| w1440.chat-empty | 32 | 14 | 13 | 108 |  |
| w1440.chat-running | 0 | 0 | 0 | 182 | no driver for chat:running |
| w1440.chat-waiting | 0 | 0 | 0 | 182 | no driver for chat:waiting |
| w1440.chat-blocked | 0 | 0 | 0 | 173 | no driver for chat:blocked |
| w1440.chat-done | 0 | 0 | 0 | 188 | no driver for chat:done |
| w1440.chat-failed | 0 | 0 | 0 | 182 | no driver for chat:failed |
| w1440.chat-offline | 0 | 0 | 0 | 188 | no driver for chat:offline |
| w1440.wb-changes | 0 | 0 | 0 | 189 | no driver for chat:waiting |
| w1440.wb-files | 0 | 0 | 0 | 184 | no driver for chat:waiting |
| w1440.wb-browser | 0 | 0 | 0 | 182 | no driver for chat:waiting |
| w1440.wb-terminal | 0 | 0 | 0 | 184 | no driver for chat:waiting |
| w1440.wb-outputs | 0 | 0 | 0 | 185 | no driver for chat:waiting |
| w1440.view-home | 0 | 0 | 0 | 214 | driver failed: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL |
| w1440.view-schedules | 0 | 0 | 0 | 178 | driver failed: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL |
| w1440.view-connections | 0 | 0 | 0 | 182 | driver failed: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL |
| w1440.view-skills | 0 | 0 | 0 | 182 | driver failed: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL |
| w1440.view-outputs | 0 | 0 | 0 | 178 | driver failed: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL |
| w1440.palette | 0 | 0 | 0 | 212 | no driver for chat:waiting |
| w1440.palette-empty | 0 | 0 | 0 | 182 | no driver for chat:waiting |
| w1440.settings | 0 | 0 | 0 | 204 | no driver for chat:waiting |
| w1440.dark-waiting | 0 | 0 | 0 | 182 | no driver for chat:waiting |
| w1440.waiting-step-open | 0 | 0 | 0 | 184 | no driver for chat:waiting, extra:stepOpen |
| w1440.running-queued | 0 | 0 | 0 | 186 | no driver for chat:running, extra:queued |
| w1440.waiting-toast-always | 0 | 0 | 0 | 182 | no driver for chat:waiting, extra:toastAlways |
| w1100.chat-waiting | 0 | 0 | 0 | 182 | no driver for chat:waiting |
| w1100.chat-empty | 33 | 12 | 14 | 108 |  |
| w1100.wb-changes | 0 | 0 | 0 | 189 | no driver for chat:waiting |
| w1100.view-home | 0 | 0 | 0 | 214 | driver failed: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL |
| w1100.settings | 0 | 0 | 0 | 204 | no driver for chat:waiting |
| w800.chat-waiting | 0 | 0 | 0 | 182 | no driver for chat:waiting |
| w800.chat-empty | 41 | 7 | 11 | 108 |  |
| w800.wb-changes | 0 | 0 | 0 | 189 | no driver for chat:waiting |
| w800.view-home | 0 | 0 | 0 | 214 | no driver for drawer:open |
| w800.settings | 0 | 0 | 0 | 204 | no driver for chat:waiting |
| w800.drawer-waiting | 0 | 0 | 0 | 182 | no driver for chat:waiting, drawer:open |
| w800.palette | 0 | 0 | 0 | 212 | no driver for chat:waiting |

## FAIL (36 key/property groups)

| Key | Property | Rows | First example (state: expected -> actual) |
| --- | --- | --- | --- |
| thread.scroll | h | 3 | w1440.chat-empty: 714.72 -> 816 |
| empty | h | 3 | w1440.chat-empty: 162.19 -> 298.19 |
| composer.dock | x | 3 | w1440.chat-empty: 275 -> 492.5 |
| composer.dock | y | 3 | w1440.chat-empty: 758.72 -> 744.6 |
| composer.dock | w | 3 | w1440.chat-empty: 1165 -> 730 |
| composer.dock | h | 3 | w1440.chat-empty: 141.28 -> 135.4 |
| composer | y | 3 | w1440.chat-empty: 758.72 -> 744.6 |
| composer | h | 3 | w1440.chat-empty: 103.89 -> 98 |
| composer.input | y | 3 | w1440.chat-empty: 769.72 -> 755.6 |
| composer.input | aria.aria-label | 3 | w1440.chat-empty: Message Vanta -> Message |
| composer.attach | y | 3 | w1440.chat-empty: 820.61 -> 800.6 |
| composer.attach | aria.aria-label | 3 | w1440.chat-empty: Attach -> Add context |
| composer.dictate | visible | 3 | w1440.chat-empty: true -> absent |
| composer.model | x | 3 | w1440.chat-empty: 886.31 -> 919.78 |
| composer.model | y | 3 | w1440.chat-empty: 824.91 -> 807.6 |
| composer.model | w | 3 | w1440.chat-empty: 89.98 -> 42.2 |
| composer.model | h | 3 | w1440.chat-empty: 21.39 -> 16 |
| composer.model | radius | 3 | w1440.chat-empty: 10.7 -> 8 |
| composer.model | text | 3 | w1440.chat-empty: Sonnet 5.5 ▾ -> ⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏ |
| composer.effort | y | 3 | w1440.chat-empty: 824.91 -> 804.9 |
| thread.column | visible | 3 | w1440.chat-empty: false -> true |
| sidebar | border.right | 2 | w1440.chat-empty: 1 -> 0 |
| titlebar.drawer | visible | 2 | w1440.chat-empty: false -> true |
| nav.new.shortcut | x | 1 | w1440.chat-empty: 236.06 -> 217 |
| nav.new.shortcut | y | 1 | w1440.chat-empty: 63.3 -> 83 |
| nav.new.shortcut | w | 1 | w1440.chat-empty: 19.94 -> 40 |
| nav.new.shortcut | fontSize | 1 | w1440.chat-empty: 12 -> 13 |
| nav.new.shortcut | fontWeight | 1 | w1440.chat-empty: 400 -> 500 |
| nav.new.shortcut | text | 1 | w1440.chat-empty: ⌘N -> ⌘ N |
| nav.new | visible | 1 | w1100.chat-empty: true -> absent |
| nav.home | filled | 1 | w1100.chat-empty: false -> true |
| titlebar.drawer | border.top | 1 | w800.chat-empty: 1 -> 0 |
| titlebar.drawer | border.right | 1 | w800.chat-empty: 1 -> 0 |
| titlebar.drawer | border.bottom | 1 | w800.chat-empty: 1 -> 0 |
| titlebar.drawer | border.left | 1 | w800.chat-empty: 1 -> 0 |
| titlebar.drawer | aria.aria-label | 1 | w800.chat-empty: Open sidebar -> Show sidebar |

## UNMAPPED keys (145)

`titlebar`, `titlebar.dots`, `titlebar.new`, `titlebar.title`, `titlebar.titleMenu`, `titlebar.project`, `titlebar.changes`, `titlebar.terminal`, `titlebar.browser`, `titlebar.files`, `titlebar.more`, `nav.new.glyph`, `nav.new.label`, `nav.search`, `nav.search.glyph`, `nav.search.label`, `nav.search.shortcut`, `nav.home.glyph`, `nav.home.label`, `nav.schedules`, `nav.schedules.glyph`, `nav.schedules.label`, `nav.connections`, `nav.connections.glyph`, `nav.connections.label`, `nav.skills`, `nav.skills.glyph`, `nav.skills.label`, `nav.outputs`, `nav.outputs.glyph`, `nav.outputs.label`, `needsYou.group`, `needsYou.label`, `needsYou.badge`, `sidebar.groupLabel[]`, `sidebar.groupName[]`, `row.session[]`, `row.session.status[]`, `row.session.title[]`, `row.session.time[]`, `sidebar.footer`, `sidebar.avatar`, `sidebar.userName`, `sidebar.userMeta`, `sidebar.settings`, `main`, `empty.title`, `empty.body`, `empty.chip[]`, `composer.permission`, `composer.send`, `composer.hint`, `titlebar.statusPill`, `banner.offline`, `banner.retry`, `thread.note`, `running.line`, `running.spinner`, `running.label`, `running.stop`, `card.diff`, `card.diff.title`, `card.diff.summary`, `card.diff.review`, `card.approval`, `card.approval.title`, `card.approval.body`, `card.blocked`, `card.blocked.title`, `card.blocked.body`, `card.error`, `card.error.title`, `card.error.body`, `card.approval.command`, `card.approval.allowOnce`, `card.approval.always`, `card.approval.reject`, `card.approval.note`, `card.blocked.skip`, `card.blocked.paste`, `card.blocked.browser`, `card.error.retry`, `card.error.viewOutput`, `workbench`, `wbtabs`, `wbtab.changes`, `wbtab.files`, `wbtab.browser`, `wbtab.terminal`, `wbtab.outputs`, `wbtab.close`, `workbench.body`, `workbench.placeholder`, `workbench.urlBar`, `page`, `page.column`, `listpage.title`, `listpage.sub`, `listpage.cta`, `home.composer`, `home.composer.input`, `home.composer.attach`, `home.composer.project`, `home.composer.send`, `home.needsYou.badge`, `home.empty`, `toast`, `palette.overlay`, `palette.sheet`, `palette.input`, `palette.empty`, `settings.overlay`, `settings.sheet`, `settings.title`, `settings.close`, `settings.panel`, `msg.user[]`, `msg.user.actions[]`, `msg.user.action[]`, `msg.user.time[]`, `msg.assistant[]`, `msg.assistant.actions[]`, `msg.assistant.action[]`, `step[]`, `workbench.row[]`, `workbench.code[]`, `workbench.action[]`, `list.row[]`, `list.row.title[]`, `list.row.note[]`, `list.row.action[]`, `home.projectChip[]`, `home.section[]`, `home.section.title[]`, `palette.option[]`, `palette.option.label[]`, `palette.option.shortcut[]`, `settings.nav[]`, `settings.row[]`, `settings.row.title[]`, `settings.row.note[]`, `settings.row.action[]`, `step.body[]`, `composer.queue[]`, `composer.queue.remove[]`

### States the app could not be driven into

| Reason | Rows |
| --- | --- |
| no driver for chat:running | 182 |
| no driver for chat:waiting | 3248 |
| no driver for chat:blocked | 173 |
| no driver for chat:done | 188 |
| no driver for chat:failed | 182 |
| no driver for chat:offline | 188 |
| driver failed: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL | 1148 |
| no driver for chat:waiting, extra:stepOpen | 184 |
| no driver for chat:running, extra:queued | 186 |
| no driver for chat:waiting, extra:toastAlways | 182 |
| no driver for drawer:open | 214 |
| no driver for chat:waiting, drawer:open | 182 |

## ALLOWED deviations

| Deviation | Rows | Reason |
| --- | --- | --- |
| owner-kept-titlebar-tools | 24 | Owner-kept feature (restore track R1): the Hermes titlebar tools stay visible beside the w |
| color-tokens | 69 | The wireframe is grayscale on purpose; the app uses Vanta color tokens. Structure (filled  |
| owner-kept-sidebar-hermes-list | 21 | Owner-kept feature (R1): the sidebar keeps the original Hermes list controls the wireframe |
| owner-kept-profile-row | 6 | Owner-kept feature (R1): the bottom-left row keeps the Hermes profile controls (home, + Ne |
| icon-glyphs | 3 | The wireframe draws icons as text glyphs (plus, magnifier, triangle...); the app uses Tabl |

## Copy by state

| State | Status | Found | Missing (first 3) |
| --- | --- | --- | --- |
| w1440.chat-empty | FAIL | 46/75 | Refactor billing webhooks; Vanta; New chat |
| w1440.chat-running | UNMAPPED | 0/87 | no driver for chat:running |
| w1440.chat-waiting | UNMAPPED | 0/91 | no driver for chat:waiting |
| w1440.chat-blocked | UNMAPPED | 0/81 | no driver for chat:blocked |
| w1440.chat-done | UNMAPPED | 0/88 | no driver for chat:done |
| w1440.chat-failed | UNMAPPED | 0/88 | no driver for chat:failed |
| w1440.chat-offline | UNMAPPED | 0/91 | no driver for chat:offline |
| w1440.wb-changes | UNMAPPED | 0/104 | no driver for chat:waiting |
| w1440.wb-files | UNMAPPED | 0/100 | no driver for chat:waiting |
| w1440.wb-browser | UNMAPPED | 0/100 | no driver for chat:waiting |
| w1440.wb-terminal | UNMAPPED | 0/100 | no driver for chat:waiting |
| w1440.wb-outputs | UNMAPPED | 0/102 | no driver for chat:waiting |
| w1440.view-home | UNMAPPED | 0/96 | driver failed: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL |
| w1440.view-schedules | UNMAPPED | 0/68 | driver failed: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL |
| w1440.view-connections | UNMAPPED | 0/71 | driver failed: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL |
| w1440.view-skills | UNMAPPED | 0/71 | driver failed: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL |
| w1440.view-outputs | UNMAPPED | 0/68 | driver failed: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL |
| w1440.palette | UNMAPPED | 0/104 | no driver for chat:waiting |
| w1440.palette-empty | UNMAPPED | 0/93 | no driver for chat:waiting |
| w1440.settings | UNMAPPED | 0/108 | no driver for chat:waiting |
| w1440.dark-waiting | UNMAPPED | 0/91 | no driver for chat:waiting |
| w1440.waiting-step-open | UNMAPPED | 0/92 | no driver for chat:waiting, extra:stepOpen |
| w1440.running-queued | UNMAPPED | 0/89 | no driver for chat:running, extra:queued |
| w1440.waiting-toast-always | UNMAPPED | 0/88 | no driver for chat:waiting, extra:toastAlways |
| w1100.chat-waiting | UNMAPPED | 0/60 | no driver for chat:waiting |
| w1100.chat-empty | FAIL | 36/44 | Refactor billing webhooks; Vanta; J |
| w1100.wb-changes | UNMAPPED | 0/73 | no driver for chat:waiting |
| w1100.view-home | UNMAPPED | 0/64 | driver failed: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL |
| w1100.settings | UNMAPPED | 0/77 | no driver for chat:waiting |
| w800.chat-waiting | UNMAPPED | 0/50 | no driver for chat:waiting |
| w800.chat-empty | FAIL | 28/34 | Refactor billing webhooks; Vanta; Sonnet 5.5 ▾ |
| w800.wb-changes | UNMAPPED | 0/63 | no driver for chat:waiting |
| w800.view-home | UNMAPPED | 0/55 | no driver for drawer:open |
| w800.settings | UNMAPPED | 0/67 | no driver for chat:waiting |
| w800.drawer-waiting | UNMAPPED | 0/93 | no driver for chat:waiting, drawer:open |
| w800.palette | UNMAPPED | 0/63 | no driver for chat:waiting |

