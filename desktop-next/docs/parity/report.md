# Wireframe parity report

Target: electron /Users/jasonpoindexter/Documents/GitHub/docs/Vanta-parity-final-20261014/desktop-next/apps/desktop. Wireframe sha256 ef50e2478569, 36 states. Verdict: **PARITY**.

| Measure | Value |
| --- | --- |
| Rows (element x state) | 6758: 3080 PASS, 3678 ALLOWED, 0 FAIL, 0 UNMAPPED |
| Parity (PASS + ALLOWED) / all rows | 100.0% |
| Role keys | 160: 155 mapped, 5 declared N/A, 0 unmapped; of mapped, 155 pass, 0 fail |
| States | 36 of 36 drivable in the app |
| Copy | 2535 of 2789 wireframe strings found (90.9%), 254 declared absent (100.0% found or declared); state rows: 0 PASS, 36 ALLOWED, 0 FAIL, 0 UNMAPPED |

## By state

| State | PASS | ALLOWED | FAIL | UNMAPPED | Note |
| --- | --- | --- | --- | --- | --- |
| w1440.chat-empty | 71 | 96 | 0 | 0 |  |
| w1440.chat-running | 70 | 112 | 0 | 0 |  |
| w1440.chat-waiting | 66 | 116 | 0 | 0 |  |
| w1440.chat-blocked | 71 | 102 | 0 | 0 |  |
| w1440.chat-done | 74 | 114 | 0 | 0 |  |
| w1440.chat-failed | 69 | 113 | 0 | 0 |  |
| w1440.chat-offline | 72 | 116 | 0 | 0 |  |
| w1440.wb-changes | 60 | 129 | 0 | 0 |  |
| w1440.wb-files | 57 | 127 | 0 | 0 |  |
| w1440.wb-browser | 55 | 127 | 0 | 0 |  |
| w1440.wb-terminal | 57 | 127 | 0 | 0 |  |
| w1440.wb-outputs | 58 | 127 | 0 | 0 |  |
| w1440.view-home | 85 | 129 | 0 | 0 |  |
| w1440.view-schedules | 86 | 92 | 0 | 0 |  |
| w1440.view-connections | 86 | 96 | 0 | 0 |  |
| w1440.view-skills | 86 | 96 | 0 | 0 |  |
| w1440.view-outputs | 86 | 92 | 0 | 0 |  |
| w1440.palette | 66 | 146 | 0 | 0 |  |
| w1440.palette-empty | 62 | 120 | 0 | 0 |  |
| w1440.settings | 66 | 138 | 0 | 0 |  |
| w1440.dark-waiting | 66 | 116 | 0 | 0 |  |
| w1440.waiting-step-open | 67 | 117 | 0 | 0 |  |
| w1440.running-queued | 72 | 114 | 0 | 0 |  |
| w1440.waiting-toast-always | 69 | 113 | 0 | 0 |  |
| w1100.chat-waiting | 109 | 73 | 0 | 0 |  |
| w1100.chat-empty | 114 | 53 | 0 | 0 |  |
| w1100.wb-changes | 103 | 86 | 0 | 0 |  |
| w1100.view-home | 128 | 86 | 0 | 0 |  |
| w1100.settings | 109 | 95 | 0 | 0 |  |
| w800.chat-waiting | 126 | 56 | 0 | 0 |  |
| w800.chat-empty | 131 | 36 | 0 | 0 |  |
| w800.wb-changes | 120 | 69 | 0 | 0 |  |
| w800.view-home | 145 | 69 | 0 | 0 |  |
| w800.settings | 126 | 78 | 0 | 0 |  |
| w800.drawer-waiting | 66 | 116 | 0 | 0 |  |
| w800.palette | 126 | 86 | 0 | 0 |  |

## FAIL (0 key/property groups)


## UNMAPPED keys (0)

none

## Declared deviations

Rows count property differences a deviation excused. Every deviation below is for owner review.

| Deviation | Rows | How | Reason |
| --- | --- | --- | --- |
| color-tokens | 3513 | ignore | The wireframe is grayscale on purpose; the app uses Vanta color tokens. Structure (filled vs not) is still compared; hue is not. |
| owner-kept-sidebar-hermes-list | 1592 | ignore | Owner-kept feature (R1): the sidebar keeps the original Hermes list controls the wireframe does not draw: SESSIONS \| BOTS tab strip (28px), Search sessions field, Pinned and Sessions sections with the filter menu, date dividers, per-row menus and kebab, messaging groups, CRON JOBS section, project lanes and a Company row. Needs you stays as the Vanta addition. Group and row positions below those controls, and the row structure (a div holding a button, a kebab column that narrows the title and time), differ by design. |
| icon-line-box | 1189 | ignore | A text glyph sits in a line box (about 20px tall) with a font size and weight; an SVG icon is its own height and has none. Width and x still must match. |
| icon-glyphs | 446 | stripGlyphs | The wireframe draws icons as text glyphs (plus, magnifier, triangle...); the app uses Tabler icons. A text difference that is only these glyphs is allowed. |
| owner-kept-titlebar-tools | 313 | ignore | Owner-kept feature (restore track R1): the Hermes titlebar tools stay visible beside the wireframe's pane toggles: settings gear, layout editor, HUD, swap sidebars, right-sidebar toggle, and the sidebar toggle at every width with its unread badge. The wireframe draws only the drawer button at 800px. |
| owner-kept-statusbar-shift | 292 | shift {"y":-20} | Owner-kept feature (R1): the 20px Hermes status bar sits under the window, so everything anchored to the bottom (the composer dock and its parts) is 20px higher than in the wireframe, which has no status bar. The offset is checked: y must equal the wireframe value minus 20. |
| reply-actions-row-shift | 276 | shift {"y":-45.98} | The wireframe draws each assistant paragraph with its own hover action row (Copy, thumbs, Retry: 4px + 21.39px) right under the first sentence; the build keeps one action row per reply, at the end, and only once the reply is complete. Everything after the first sentence therefore starts 25.39px higher, on top of the prompt-bubble offset (20.59px). The offset is checked: y must equal the wireframe value minus 45.98. |
| owner-kept-profile-row | 259 | N/A | Owner-kept feature (R1): the bottom-left row keeps the Hermes profile controls (home, + New profile, Import profile, ... Manage profiles) beside the settings gear; the wireframe footer is the gear only. There is no profile chip. |
| reply-action-row-per-reply | 217 | ignore | The wireframe draws a hover action row (Copy, thumbs up and down, Retry) under every assistant paragraph; the build keeps one row per reply, at its end, once the reply is complete (Hermes message model: one assistant message holds the whole turn). The row's own styling is measured by tools/chat-parity (assistantActions) in the done and offline states. |
| owner-kept-nav-labels | 200 | ignore | Owner-kept feature (R1): the nav row for New chat reads New session and Search is a field, as in Hermes (the New session row is also a drag source for splits). |
| owner-kept-search-field | 150 | ignore | Owner-kept feature (R1): Search is the Hermes session search field (a 101px input with a magnifier), not a 258px row with a label; the wireframe's row geometry, label and typography do not apply. |
| wireframe-user-bubble-wrap-shift | 136 | shift {"y":-20.59} | Consequence of the wireframe's nested max-width:80% (see wireframe-user-bubble-nesting): its prompt bubble wraps to two lines (56.6px) where the build's holds one (36px), so everything below the prompt starts 20.59px higher in the build. The offset is checked: y must equal the wireframe value minus 20.59. |
| owner-kept-sidebar-search-field | 125 | shift {"y":-8} | Owner-kept feature (R1): Search is the Hermes search field below the nav, not a 36px row between New chat and Home, so Home to Outputs start 36px higher; with the 28px tab strip their labels are 8px higher than the wireframe. The offset is checked: y must equal the wireframe value minus 8. |
| titlebar-left-cluster-shift | 92 | shift {"x":51} | The native macOS traffic lights reserve their own width and the owner-kept sidebar toggle sits before New chat, so the title, its menu chip, the project chip and the status pill start 51px further right than the wireframe's dots and New chat. The offset is checked: x must equal the wireframe value plus 51. |
| sidebar-row-kebab-column | 87 | ignore | Owner-kept feature (R1): every Hermes session row reserves a 20px actions column for its kebab menu, so the title is narrower and the time sits in a fixed 20-24px box instead of the wireframe's text-width time at the row edge. |
| composer-floats-over-thread | 55 | ignore | The thread scroller runs the full height of the pane and the composer floats over its bottom, with scroll clearance reserved below the last message (Hermes layout, kept so the transcript scrolls behind a translucent composer edge). The wireframe stacks a shorter scroller above the dock, so the scroller and the column are taller by the clearance. |
| w-composite-aria-roles | 53 | ignore | Workbench tabs and palette rows are real tab and option widgets (roving arrows, aria-selected, aria-activedescendant); the wireframe draws plain buttons. Track W, owner to confirm. |
| wireframe-user-bubble-nesting | 52 | ignore | Wireframe quirk: .msg-u sets max-width:80% inside a flex item that is already 80% wide, so the bubble is 64% of the column (426px) and wraps to two lines. The build bubble is 80% (532px) and holds the prompt on one line. |
| owner-kept-statusbar-height | 46 | shift {"h":-20} | Owner-kept feature (R1): the 20px Hermes status bar takes height from the main pane and the workbench column (836 instead of 856). The height must equal the wireframe value minus 20. |
| native-window-controls | 36 | N/A | The wireframe draws three gray dots for the window controls; the app uses the native macOS traffic lights. |
| search-shortcut-hint | 36 | N/A | Owner-kept feature (R1): the sidebar search is a session filter field with no shortcut hint; Command-K opens the command palette from anywhere, and the palette lists it. |
| main-landmark | 36 | ignore | The workspace pane hosts several chat tiles and pages, so it is not a single main landmark; the wireframe's .main is a main element. |
| owner-kept-restore-checkpoint | 26 | shift {"x":-25.39} | Owner-kept feature (R1): a Restore checkpoint button follows the time at the end of a prompt's action row, so Copy, Edit and the time sit 21.39px + the 4px gap to the left of the wireframe's. The offset is checked: x must equal the wireframe value minus 25.39. |
| owner-kept-sidebar-tab-strip | 25 | shift {"y":28} | Owner-kept feature (R1): the SESSIONS \| BOTS tab strip is 28px tall and sits above the nav, so New chat and its shortcut start 28px lower. The offset is checked: y must equal the wireframe value plus 28. |
| w-icon-box-width | 18 | ignore | A Tabler icon box replaces a text glyph whose advance differs per glyph, so a row title line is a few px wider or narrower when the title is the longest line. Track W. |
| wireframe-empty-keeps-focused-chat | 17 | ignore | Wireframe quirk: its empty state reuses the previously focused chat (title 'Refactor billing webhooks', project chip Vanta, that chat's row selected) over an empty thread. The build's empty state is a new chat: 'New chat', no project chip until a folder is chosen, no row selected, and the thread column holds the starter prompts. |
| expanded-step-rows | 12 | shift {"y":8.07} | An expanded 'Read 3 files' lists each file as its own step row (Read webhooks.ts, ...; Hermes tool-group view) instead of the wireframe's one-line comma list in a 2px-ruled box, so the body is 91px tall instead of 36.84px and the cards below start 54.05px lower. The card offset is checked. |
| running-spinner-box | 9 | ignore | The wireframe's running spinner is the 7.5px text glyph '◌'; the build draws a 14px braille spinner in a 14px box, so the box is wider and the label starts 6.5px further right. The offset of the label is checked. |
| w-code-keeps-line-breaks | 7 | ignore | Wireframe .code has no white-space:pre, so its multi-line diff, tree and terminal text collapses to one line; the build keeps the line breaks, which changes the block height and what sits under it. Track W, owner to confirm. |
| expanded-step-body | 7 | ignore | See expanded-step-rows: the expanded body is a list of rows, not a one-line comma list in a ruled box. |
| owner-kept-queue-controls | 6 | ignore | Owner-kept feature: a queued message keeps its Edit and Steer buttons beside Remove, so the row is 1.5px taller, filled, and Remove sits further left than the wireframe's text-and-Remove row. |
| titlebar-left-cluster-shift-narrow | 6 | shift {"x":15} | At 800px the wireframe also draws a drawer button before New chat, so only the native traffic lights' extra width remains: the title, its menu chip, the project chip and the status pill start 15px further right. The offset is checked: x must equal the wireframe value plus 15. |
| failed-command-row-shift | 5 | shift {"y":4.02} | The failed command keeps its own 36px step row plus the 14px gap above the error card (see failed-command-step), so the card starts 50px lower than the wireframe's other offsets predict. y must equal the wireframe value minus 45.98 plus 50. |
| wireframe-failed-offline-keep-waiting | 4 | ignore | Wireframe quirk: in its failed and offline states the focused chat's sidebar row stays Waiting (and Needs you keeps 2) while the title bar says Failed or Offline. A real chat has one status that the row, the pill and Needs you all read, so the build's row follows the chat (done) and Needs you counts 1; the focused row also moves from Needs you into its group. |
| open-chat-row-tint | 4 | ignore | Hermes tints the row of a chat that is open in a pane even while a page is showing (open-in-pane indicator); the wireframe's rows are untinted on pages. |
| running-label-shift | 3 | shift {"x":6.5} | Consequence of running-spinner-box: the running label starts after a 14px spinner instead of the 7.5px glyph. x must equal the wireframe value plus 6.5. |
| offline-composer-disabled | 3 | ignore | Offline the build disables the composer (placeholder 'Reconnecting to Vanta…', model and effort menus need the backend) instead of accepting queued messages as the wireframe's banner says. Owner decision pending: queue-while-offline is not built. |
| owner-kept-error-dismiss | 2 | ignore | Owner-kept feature: the failure card keeps its Dismiss error button, which takes a 24px column plus the 6px gap from the title and body width. |
| w-rail-rule-leak | 2 | ignore | Wireframe rule .w1100 .badge{display:none} targets the sidebar rail but also hides Home's Needs you badge at 1100; the build keeps the badge visible. Track W, owner to confirm. |
| banner-glyph-box | 1 | shift {"x":8.85} | The offline banner's leading '○' is a 12px outlined-circle icon with an 8px gap, wider than the wireframe's text glyph, so the Retry button starts 8.85px further right. x must equal the wireframe value plus 8.85. |

### Copy declared absent

| Deviation | Strings | States | Reason |
| --- | --- | --- | --- |
| copy-no-profile-chip | J \| Jason \| Local · Sonnet 5.5 | all | The owner does not want a profile chip in the sidebar footer: the footer is the settings gear only (with the kept Hermes profile row). The wireframe's avatar initial, name and 'Local · model' line are not shown. |
| copy-nav-labels | New chat \| Search \| ⌘K | all | Owner-kept: the first nav row reads 'New session' (it is also a drag source for splits), and Search is the Hermes session search field with its own placeholder, with no shortcut hint. |
| copy-project-groups | VANTA \| PORTFOLIO | all | The kept Hermes list groups the rest of the chats under 'Sessions' (and 'Cron jobs'), not under project names. |
| copy-reply-retry | Retry | *.chat-running, *.chat-waiting, *.wb-*, *.palette*, *.settings, *.dark-waiting, *.waiting-*, *.running-queued, *.drawer-waiting, *.chat-failed | The build shows an assistant message's Copy, thumbs and Retry row once the reply is complete, at its end; a reply still being written has no Retry. |
| copy-empty-keeps-focused-chat | Refactor billing webhooks \| Vanta | *.chat-empty | Wireframe quirk: its empty state still names the previously focused chat and project in the title bar (see wireframe-empty-keeps-focused-chat). |
| copy-failed-offline-needs-count | 2 | *.chat-failed, *.chat-offline, *.chat-empty | Wireframe quirk: its failed, offline and empty states keep Needs you at 2 (see wireframe-failed-offline-keep-waiting); the build counts 1. |
| copy-offline-effort | Medium ▾ \| Sonnet 5.5 ▾ Medium ▾ Ask each time ▾ \| [placeholder] Ask Vanta to do something | *.chat-offline | While the backend is away the build disables the composer: its placeholder says 'Reconnecting to Vanta…' and the model and effort menus need the backend (see offline-composer-disabled). The wireframe keeps the composer enabled with its normal placeholder and chips. |
| copy-live-clock | ◌ Running 0:42 | *.chat-running, *.running-queued, *.waiting-toast-always | The status pill splits the word and the elapsed clock into two spans, and the clock moves; the wireframe prints '◌ Running 0:42' as one string. |
| copy-expanded-step | billing/webhooks.ts, billing/retry.ts, billing/webhooks.test.ts | *.waiting-step-open | An expanded 'Read 3 files' lists one row per file (see expanded-step-rows) instead of a comma-separated list. |

## Copy by state

| State | Status | Found | Missing (first 3) |
| --- | --- | --- | --- |
| w1440.chat-empty | ALLOWED | 62/73 |  |
| w1440.chat-running | ALLOWED | 75/85 |  |
| w1440.chat-waiting | ALLOWED | 80/89 |  |
| w1440.chat-blocked | ALLOWED | 71/79 |  |
| w1440.chat-done | ALLOWED | 78/86 |  |
| w1440.chat-failed | ALLOWED | 76/86 |  |
| w1440.chat-offline | ALLOWED | 77/88 |  |
| w1440.wb-changes | ALLOWED | 93/102 |  |
| w1440.wb-files | ALLOWED | 89/98 |  |
| w1440.wb-browser | ALLOWED | 89/98 |  |
| w1440.wb-terminal | ALLOWED | 89/98 |  |
| w1440.wb-outputs | ALLOWED | 91/100 |  |
| w1440.view-home | ALLOWED | 82/90 |  |
| w1440.view-schedules | ALLOWED | 57/65 |  |
| w1440.view-connections | ALLOWED | 59/67 |  |
| w1440.view-skills | ALLOWED | 59/67 |  |
| w1440.view-outputs | ALLOWED | 57/65 |  |
| w1440.palette | ALLOWED | 93/102 |  |
| w1440.palette-empty | ALLOWED | 82/91 |  |
| w1440.settings | ALLOWED | 94/103 |  |
| w1440.dark-waiting | ALLOWED | 80/89 |  |
| w1440.waiting-step-open | ALLOWED | 80/90 |  |
| w1440.running-queued | ALLOWED | 77/87 |  |
| w1440.waiting-toast-always | ALLOWED | 76/86 |  |
| w1100.chat-waiting | ALLOWED | 54/58 |  |
| w1100.chat-empty | ALLOWED | 37/42 |  |
| w1100.wb-changes | ALLOWED | 67/71 |  |
| w1100.view-home | ALLOWED | 55/58 |  |
| w1100.settings | ALLOWED | 68/72 |  |
| w800.chat-waiting | ALLOWED | 47/48 |  |
| w800.chat-empty | ALLOWED | 30/32 |  |
| w800.wb-changes | ALLOWED | 60/61 |  |
| w800.view-home | ALLOWED | 49/49 |  |
| w800.settings | ALLOWED | 61/62 |  |
| w800.drawer-waiting | ALLOWED | 82/91 |  |
| w800.palette | ALLOWED | 59/61 |  |

