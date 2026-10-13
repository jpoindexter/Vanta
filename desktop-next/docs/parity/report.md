# Wireframe parity report

Target: electron /Users/jasonpoindexter/Documents/GitHub/docs/Vanta-desktop-next-20261013/desktop-next/apps/desktop. Wireframe sha256 617372c7d41d, 36 states. Verdict: **NOT AT PARITY**.

| Measure | Value |
| --- | --- |
| Rows (element x state) | 6758: 0 PASS, 0 ALLOWED, 42 FAIL, 6716 UNMAPPED |
| Parity (PASS + ALLOWED) / all rows | 0.0% |
| Role keys | 160: 14 mapped, 146 unmapped; of mapped, 0 pass, 14 fail |
| States | 3 of 36 drivable in the app |
| Copy | 52 of 2889 wireframe strings found (1.8%); state rows: 0 PASS, 0 ALLOWED, 3 FAIL, 33 UNMAPPED |

## By state

| State | PASS | ALLOWED | FAIL | UNMAPPED | Note |
| --- | --- | --- | --- | --- | --- |
| w1440.chat-empty | 0 | 0 | 14 | 153 |  |
| w1440.chat-running | 0 | 0 | 0 | 182 | no driver for chat:running |
| w1440.chat-waiting | 0 | 0 | 0 | 182 | no driver for chat:waiting |
| w1440.chat-blocked | 0 | 0 | 0 | 173 | no driver for chat:blocked |
| w1440.chat-done | 0 | 0 | 0 | 188 | no driver for chat:done |
| w1440.chat-failed | 0 | 0 | 0 | 182 | no driver for chat:failed |
| w1440.chat-offline | 0 | 0 | 0 | 188 | no driver for chat:offline |
| w1440.wb-changes | 0 | 0 | 0 | 189 | no driver for chat:waiting, wb:changes |
| w1440.wb-files | 0 | 0 | 0 | 184 | no driver for chat:waiting, wb:files |
| w1440.wb-browser | 0 | 0 | 0 | 182 | no driver for chat:waiting, wb:browser |
| w1440.wb-terminal | 0 | 0 | 0 | 184 | no driver for chat:waiting, wb:terminal |
| w1440.wb-outputs | 0 | 0 | 0 | 185 | no driver for chat:waiting, wb:outputs |
| w1440.view-home | 0 | 0 | 0 | 214 | no driver for view:home |
| w1440.view-schedules | 0 | 0 | 0 | 178 | no driver for view:schedules |
| w1440.view-connections | 0 | 0 | 0 | 182 | no driver for view:connections |
| w1440.view-skills | 0 | 0 | 0 | 182 | no driver for view:skills |
| w1440.view-outputs | 0 | 0 | 0 | 178 | no driver for view:outputs |
| w1440.palette | 0 | 0 | 0 | 212 | no driver for chat:waiting, overlay:palette |
| w1440.palette-empty | 0 | 0 | 0 | 182 | no driver for chat:waiting, overlay:paletteEmpty |
| w1440.settings | 0 | 0 | 0 | 204 | no driver for chat:waiting, overlay:settings |
| w1440.dark-waiting | 0 | 0 | 0 | 182 | no driver for chat:waiting |
| w1440.waiting-step-open | 0 | 0 | 0 | 184 | no driver for chat:waiting, extra:stepOpen |
| w1440.running-queued | 0 | 0 | 0 | 186 | no driver for chat:running, extra:queued |
| w1440.waiting-toast-always | 0 | 0 | 0 | 182 | no driver for chat:waiting, extra:toastAlways |
| w1100.chat-waiting | 0 | 0 | 0 | 182 | no driver for chat:waiting |
| w1100.chat-empty | 0 | 0 | 14 | 153 |  |
| w1100.wb-changes | 0 | 0 | 0 | 189 | no driver for chat:waiting, wb:changes |
| w1100.view-home | 0 | 0 | 0 | 214 | no driver for view:home |
| w1100.settings | 0 | 0 | 0 | 204 | no driver for chat:waiting, overlay:settings |
| w800.chat-waiting | 0 | 0 | 0 | 182 | no driver for chat:waiting |
| w800.chat-empty | 0 | 0 | 14 | 153 |  |
| w800.wb-changes | 0 | 0 | 0 | 189 | no driver for chat:waiting, wb:changes |
| w800.view-home | 0 | 0 | 0 | 214 | no driver for drawer:open, view:home |
| w800.settings | 0 | 0 | 0 | 204 | no driver for chat:waiting, overlay:settings |
| w800.drawer-waiting | 0 | 0 | 0 | 182 | no driver for chat:waiting, drawer:open |
| w800.palette | 0 | 0 | 0 | 212 | no driver for chat:waiting, overlay:palette |

## FAIL (100 key/property groups)

| Key | Property | Rows | First example (state: expected -> actual) |
| --- | --- | --- | --- |
| thread.scroll | x | 3 | w1440.chat-empty: 275 -> 260 |
| thread.scroll | y | 3 | w1440.chat-empty: 44 -> 34 |
| thread.scroll | w | 3 | w1440.chat-empty: 1165 -> 1180 |
| thread.scroll | h | 3 | w1440.chat-empty: 720.02 -> 828 |
| empty | x | 3 | w1440.chat-empty: 537.5 -> 284 |
| empty | y | 3 | w1440.chat-empty: 114 -> 349.66 |
| empty | w | 3 | w1440.chat-empty: 640 -> 1132 |
| empty | h | 3 | w1440.chat-empty: 162.19 -> 246.66 |
| composer.dock | x | 3 | w1440.chat-empty: 275 -> 271 |
| composer.dock | y | 3 | w1440.chat-empty: 764.02 -> 827.5 |
| composer.dock | w | 3 | w1440.chat-empty: 1165 -> 1158 |
| composer.dock | h | 3 | w1440.chat-empty: 135.98 -> 52.5 |
| composer | x | 3 | w1440.chat-empty: 497.5 -> 276 |
| composer | y | 3 | w1440.chat-empty: 764.02 -> 827.5 |
| composer | w | 3 | w1440.chat-empty: 720 -> 1148 |
| composer | h | 3 | w1440.chat-empty: 98.59 -> 42.5 |
| composer | filled | 3 | w1440.chat-empty: true -> false |
| composer.input | x | 3 | w1440.chat-empty: 510.5 -> 313 |
| composer.input | y | 3 | w1440.chat-empty: 775.02 -> 833.5 |
| composer.input | w | 3 | w1440.chat-empty: 694 -> 854.26 |
| composer.input | h | 3 | w1440.chat-empty: 44.59 -> 30.5 |
| composer.input | aria.aria-label | 3 | w1440.chat-empty: Message Vanta -> Message |
| composer.attach | x | 3 | w1440.chat-empty: 510.5 -> 285 |
| composer.attach | y | 3 | w1440.chat-empty: 820.61 -> 836.5 |
| composer.attach | w | 3 | w1440.chat-empty: 30 -> 24 |
| composer.attach | h | 3 | w1440.chat-empty: 30 -> 24 |
| composer.attach | border.top | 3 | w1440.chat-empty: 1 -> 0 |
| composer.attach | border.right | 3 | w1440.chat-empty: 1 -> 0 |
| composer.attach | border.bottom | 3 | w1440.chat-empty: 1 -> 0 |
| composer.attach | border.left | 3 | w1440.chat-empty: 1 -> 0 |
| composer.attach | filled | 3 | w1440.chat-empty: true -> false |
| composer.attach | aria.aria-label | 3 | w1440.chat-empty: Attach -> Add context |
| composer.dictate | x | 3 | w1440.chat-empty: 546.5 -> 1341 |
| composer.dictate | y | 3 | w1440.chat-empty: 820.61 -> 836.75 |
| composer.dictate | w | 3 | w1440.chat-empty: 30 -> 24 |
| composer.dictate | h | 3 | w1440.chat-empty: 30 -> 24 |
| composer.dictate | radius | 3 | w1440.chat-empty: 8 -> 12 |
| composer.dictate | border.top | 3 | w1440.chat-empty: 1 -> 0 |
| composer.dictate | border.right | 3 | w1440.chat-empty: 1 -> 0 |
| composer.dictate | border.bottom | 3 | w1440.chat-empty: 1 -> 0 |
| composer.dictate | border.left | 3 | w1440.chat-empty: 1 -> 0 |
| composer.dictate | filled | 3 | w1440.chat-empty: true -> false |
| composer.dictate | aria.aria-label | 3 | w1440.chat-empty: Dictate -> Voice dictation |
| composer.model | x | 3 | w1440.chat-empty: 886.31 -> 1171.26 |
| composer.model | y | 3 | w1440.chat-empty: 824.91 -> 836.75 |
| composer.model | w | 3 | w1440.chat-empty: 89.98 -> 103.02 |
| composer.model | h | 3 | w1440.chat-empty: 21.39 -> 24 |
| composer.model | radius | 3 | w1440.chat-empty: 10.7 -> 8 |
| composer.model | border.top | 3 | w1440.chat-empty: 1 -> 0 |
| composer.model | border.right | 3 | w1440.chat-empty: 1 -> 0 |
| composer.model | border.bottom | 3 | w1440.chat-empty: 1 -> 0 |
| composer.model | border.left | 3 | w1440.chat-empty: 1 -> 0 |
| composer.model | text | 3 | w1440.chat-empty: Sonnet 5.5 ▾ -> Mock Model |
| composer.model | filled | 3 | w1440.chat-empty: true -> false |
| thread.column | visible | 3 | w1440.chat-empty: false -> true |
| sidebar | y | 2 | w1440.chat-empty: 44 -> 62 |
| sidebar | w | 2 | w1440.chat-empty: 275 -> 260 |
| sidebar | h | 2 | w1440.chat-empty: 856 -> 818 |
| sidebar | border.right | 2 | w1440.chat-empty: 1 -> 0 |
| sidebar | aria.aria-label | 2 | w1440.chat-empty: Sidebar -> null |
| sidebar | aria.role | 2 | w1440.chat-empty: complementary -> null |
| nav.new | y | 2 | w1440.chat-empty: 54 -> 68 |
| nav.new | w | 2 | w1440.chat-empty: 258 -> 240 |
| nav.new | h | 2 | w1440.chat-empty: 36 -> 28 |
| nav.new | border.top | 2 | w1440.chat-empty: 0 -> 1 |
| nav.new | border.right | 2 | w1440.chat-empty: 0 -> 1 |
| nav.new | border.bottom | 2 | w1440.chat-empty: 0 -> 1 |
| nav.new | border.left | 2 | w1440.chat-empty: 0 -> 1 |
| nav.schedules | y | 2 | w1440.chat-empty: 162 -> 184 |
| nav.schedules | w | 2 | w1440.chat-empty: 258 -> 240 |
| nav.schedules | h | 2 | w1440.chat-empty: 36 -> 28 |
| nav.schedules | border.top | 2 | w1440.chat-empty: 0 -> 1 |
| nav.schedules | border.right | 2 | w1440.chat-empty: 0 -> 1 |
| nav.schedules | border.bottom | 2 | w1440.chat-empty: 0 -> 1 |
| nav.schedules | border.left | 2 | w1440.chat-empty: 0 -> 1 |
| composer.effort | x | 2 | w1440.chat-empty: 980.09 -> 1278.28 |
| composer.effort | y | 2 | w1440.chat-empty: 824.91 -> 836.75 |
| composer.effort | w | 2 | w1440.chat-empty: 74.17 -> 58.72 |
| composer.effort | h | 2 | w1440.chat-empty: 21.39 -> 24 |
| composer.effort | radius | 2 | w1440.chat-empty: 10.7 -> 8 |
| composer.effort | border.top | 2 | w1440.chat-empty: 1 -> 0 |
| composer.effort | border.right | 2 | w1440.chat-empty: 1 -> 0 |
| composer.effort | border.bottom | 2 | w1440.chat-empty: 1 -> 0 |
| composer.effort | border.left | 2 | w1440.chat-empty: 1 -> 0 |
| composer.effort | text | 2 | w1440.chat-empty: Medium ▾ -> Med |
| composer.effort | filled | 2 | w1440.chat-empty: true -> false |
| nav.new.shortcut | visible | 2 | w1100.chat-empty: false -> true |
| nav.new.shortcut | x | 1 | w1440.chat-empty: 236.06 -> 201 |
| nav.new.shortcut | y | 1 | w1440.chat-empty: 63.3 -> 73 |
| nav.new.shortcut | w | 1 | w1440.chat-empty: 19.94 -> 40 |
| nav.new.shortcut | fontSize | 1 | w1440.chat-empty: 12 -> 13 |
| nav.new.shortcut | fontWeight | 1 | w1440.chat-empty: 400 -> 500 |
| nav.new.shortcut | text | 1 | w1440.chat-empty: ⌘N -> ⌘ N |
| composer.input | placeholder | 1 | w1440.chat-empty: What are we building? -> Give Hermes a task |
| sidebar | visible | 1 | w800.chat-empty: false -> true |
| nav.new | visible | 1 | w800.chat-empty: false -> true |
| nav.schedules | visible | 1 | w800.chat-empty: false -> true |
| composer.model | fontSize | 1 | w800.chat-empty: 12 -> null |
| composer.model | fontWeight | 1 | w800.chat-empty: 400 -> null |
| composer.effort | visible | 1 | w800.chat-empty: true -> absent |

## UNMAPPED keys (146)

`titlebar`, `titlebar.dots`, `titlebar.new`, `titlebar.title`, `titlebar.titleMenu`, `titlebar.project`, `titlebar.changes`, `titlebar.terminal`, `titlebar.browser`, `titlebar.files`, `titlebar.more`, `nav.new.glyph`, `nav.new.label`, `nav.search`, `nav.search.glyph`, `nav.search.label`, `nav.search.shortcut`, `nav.home`, `nav.home.glyph`, `nav.home.label`, `nav.schedules.glyph`, `nav.schedules.label`, `nav.connections`, `nav.connections.glyph`, `nav.connections.label`, `nav.skills`, `nav.skills.glyph`, `nav.skills.label`, `nav.outputs`, `nav.outputs.glyph`, `nav.outputs.label`, `needsYou.group`, `needsYou.label`, `needsYou.badge`, `sidebar.groupLabel[]`, `sidebar.groupName[]`, `row.session[]`, `row.session.status[]`, `row.session.title[]`, `row.session.time[]`, `sidebar.footer`, `sidebar.avatar`, `sidebar.userName`, `sidebar.userMeta`, `sidebar.settings`, `main`, `empty.title`, `empty.body`, `empty.chip[]`, `composer.permission`, `composer.send`, `composer.hint`, `titlebar.drawer`, `titlebar.statusPill`, `banner.offline`, `banner.retry`, `thread.note`, `running.line`, `running.spinner`, `running.label`, `running.stop`, `card.diff`, `card.diff.title`, `card.diff.summary`, `card.diff.review`, `card.approval`, `card.approval.title`, `card.approval.body`, `card.blocked`, `card.blocked.title`, `card.blocked.body`, `card.error`, `card.error.title`, `card.error.body`, `card.approval.command`, `card.approval.allowOnce`, `card.approval.always`, `card.approval.reject`, `card.approval.note`, `card.blocked.skip`, `card.blocked.paste`, `card.blocked.browser`, `card.error.retry`, `card.error.viewOutput`, `workbench`, `wbtabs`, `wbtab.changes`, `wbtab.files`, `wbtab.browser`, `wbtab.terminal`, `wbtab.outputs`, `wbtab.close`, `workbench.body`, `workbench.placeholder`, `workbench.urlBar`, `page`, `page.column`, `listpage.title`, `listpage.sub`, `listpage.cta`, `home.composer`, `home.composer.input`, `home.composer.attach`, `home.composer.project`, `home.composer.send`, `home.needsYou.badge`, `home.empty`, `toast`, `palette.overlay`, `palette.sheet`, `palette.input`, `palette.empty`, `settings.overlay`, `settings.sheet`, `settings.title`, `settings.close`, `settings.panel`, `msg.user[]`, `msg.user.actions[]`, `msg.user.action[]`, `msg.user.time[]`, `msg.assistant[]`, `msg.assistant.actions[]`, `msg.assistant.action[]`, `step[]`, `workbench.row[]`, `workbench.code[]`, `workbench.action[]`, `list.row[]`, `list.row.title[]`, `list.row.note[]`, `list.row.action[]`, `home.projectChip[]`, `home.section[]`, `home.section.title[]`, `palette.option[]`, `palette.option.label[]`, `palette.option.shortcut[]`, `settings.nav[]`, `settings.row[]`, `settings.row.title[]`, `settings.row.note[]`, `settings.row.action[]`, `step.body[]`, `composer.queue[]`, `composer.queue.remove[]`

### States the app could not be driven into

| Reason | Rows |
| --- | --- |
| no driver for chat:running | 182 |
| no driver for chat:waiting | 728 |
| no driver for chat:blocked | 173 |
| no driver for chat:done | 188 |
| no driver for chat:failed | 182 |
| no driver for chat:offline | 188 |
| no driver for chat:waiting, wb:changes | 567 |
| no driver for chat:waiting, wb:files | 184 |
| no driver for chat:waiting, wb:browser | 182 |
| no driver for chat:waiting, wb:terminal | 184 |
| no driver for chat:waiting, wb:outputs | 185 |
| no driver for view:home | 428 |
| no driver for view:schedules | 178 |
| no driver for view:connections | 182 |
| no driver for view:skills | 182 |
| no driver for view:outputs | 178 |
| no driver for chat:waiting, overlay:palette | 424 |
| no driver for chat:waiting, overlay:paletteEmpty | 182 |
| no driver for chat:waiting, overlay:settings | 612 |
| no driver for chat:waiting, extra:stepOpen | 184 |
| no driver for chat:running, extra:queued | 186 |
| no driver for chat:waiting, extra:toastAlways | 182 |
| no driver for drawer:open, view:home | 214 |
| no driver for chat:waiting, drawer:open | 182 |

## ALLOWED deviations

| Deviation | Rows | Reason |
| --- | --- | --- |
| color-tokens | 49 | The wireframe is grayscale on purpose; the app uses Vanta color tokens. Structure (filled  |

## Copy by state

| State | Status | Found | Missing (first 3) |
| --- | --- | --- | --- |
| w1440.chat-empty | FAIL | 23/75 | Refactor billing webhooks; Vanta; New chat |
| w1440.chat-running | UNMAPPED | 0/87 | no driver for chat:running |
| w1440.chat-waiting | UNMAPPED | 0/91 | no driver for chat:waiting |
| w1440.chat-blocked | UNMAPPED | 0/81 | no driver for chat:blocked |
| w1440.chat-done | UNMAPPED | 0/88 | no driver for chat:done |
| w1440.chat-failed | UNMAPPED | 0/88 | no driver for chat:failed |
| w1440.chat-offline | UNMAPPED | 0/91 | no driver for chat:offline |
| w1440.wb-changes | UNMAPPED | 0/104 | no driver for chat:waiting, wb:changes |
| w1440.wb-files | UNMAPPED | 0/100 | no driver for chat:waiting, wb:files |
| w1440.wb-browser | UNMAPPED | 0/100 | no driver for chat:waiting, wb:browser |
| w1440.wb-terminal | UNMAPPED | 0/100 | no driver for chat:waiting, wb:terminal |
| w1440.wb-outputs | UNMAPPED | 0/102 | no driver for chat:waiting, wb:outputs |
| w1440.view-home | UNMAPPED | 0/96 | no driver for view:home |
| w1440.view-schedules | UNMAPPED | 0/68 | no driver for view:schedules |
| w1440.view-connections | UNMAPPED | 0/71 | no driver for view:connections |
| w1440.view-skills | UNMAPPED | 0/71 | no driver for view:skills |
| w1440.view-outputs | UNMAPPED | 0/68 | no driver for view:outputs |
| w1440.palette | UNMAPPED | 0/104 | no driver for chat:waiting, overlay:palette |
| w1440.palette-empty | UNMAPPED | 0/93 | no driver for chat:waiting, overlay:paletteEmpty |
| w1440.settings | UNMAPPED | 0/108 | no driver for chat:waiting, overlay:settings |
| w1440.dark-waiting | UNMAPPED | 0/91 | no driver for chat:waiting |
| w1440.waiting-step-open | UNMAPPED | 0/92 | no driver for chat:waiting, extra:stepOpen |
| w1440.running-queued | UNMAPPED | 0/89 | no driver for chat:running, extra:queued |
| w1440.waiting-toast-always | UNMAPPED | 0/88 | no driver for chat:waiting, extra:toastAlways |
| w1100.chat-waiting | UNMAPPED | 0/60 | no driver for chat:waiting |
| w1100.chat-empty | FAIL | 18/44 | Refactor billing webhooks; Vanta; J |
| w1100.wb-changes | UNMAPPED | 0/73 | no driver for chat:waiting, wb:changes |
| w1100.view-home | UNMAPPED | 0/64 | no driver for view:home |
| w1100.settings | UNMAPPED | 0/77 | no driver for chat:waiting, overlay:settings |
| w800.chat-waiting | UNMAPPED | 0/50 | no driver for chat:waiting |
| w800.chat-empty | FAIL | 11/34 | Refactor billing webhooks; Vanta; What should Vanta do? |
| w800.wb-changes | UNMAPPED | 0/63 | no driver for chat:waiting, wb:changes |
| w800.view-home | UNMAPPED | 0/55 | no driver for drawer:open, view:home |
| w800.settings | UNMAPPED | 0/67 | no driver for chat:waiting, overlay:settings |
| w800.drawer-waiting | UNMAPPED | 0/93 | no driver for chat:waiting, drawer:open |
| w800.palette | UNMAPPED | 0/63 | no driver for chat:waiting, overlay:palette |

