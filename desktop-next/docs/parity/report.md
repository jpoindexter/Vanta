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

## ALLOWED deviations

| Deviation | Rows | Reason |
| --- | --- | --- |
| owner-kept-titlebar-tools | 313 | Owner-kept feature (restore track R1): the Hermes titlebar tools stay visible beside the w |
| color-tokens | 3513 | The wireframe is grayscale on purpose; the app uses Vanta color tokens. Structure (filled  |
| native-window-controls | 36 | The wireframe draws three gray dots for the window controls; the app uses the native macOS |
| titlebar-left-cluster-shift | 92 | The native macOS traffic lights reserve their own width and the owner-kept sidebar toggle  |
| wireframe-empty-keeps-focused-chat | 17 | Wireframe quirk: its empty state reuses the previously focused chat (title 'Refactor billi |
| owner-kept-sidebar-hermes-list | 1592 | Owner-kept feature (R1): the sidebar keeps the original Hermes list controls the wireframe |
| icon-line-box | 1189 | A text glyph sits in a line box (about 20px tall) with a font size and weight; an SVG icon |
| icon-glyphs | 446 | The wireframe draws icons as text glyphs (plus, magnifier, triangle...); the app uses Tabl |
| owner-kept-nav-labels | 200 | Owner-kept feature (R1): the nav row for New chat reads New session and Search is a field, |
| owner-kept-sidebar-tab-strip | 25 | Owner-kept feature (R1): the SESSIONS \| BOTS tab strip is 28px tall and sits above the na |
| owner-kept-search-field | 150 | Owner-kept feature (R1): Search is the Hermes session search field (a 101px input with a m |
| search-shortcut-hint | 36 | Owner-kept feature (R1): the sidebar search is a session filter field with no shortcut hin |
| owner-kept-sidebar-search-field | 125 | Owner-kept feature (R1): Search is the Hermes search field below the nav, not a 36px row b |
| sidebar-row-kebab-column | 87 | Owner-kept feature (R1): every Hermes session row reserves a 20px actions column for its k |
| owner-kept-profile-row | 259 | Owner-kept feature (R1): the bottom-left row keeps the Hermes profile controls (home, + Ne |
| owner-kept-statusbar-height | 46 | Owner-kept feature (R1): the 20px Hermes status bar takes height from the main pane and th |
| main-landmark | 36 | The workspace pane hosts several chat tiles and pages, so it is not a single main landmark |
| composer-floats-over-thread | 55 | The thread scroller runs the full height of the pane and the composer floats over its bott |
| owner-kept-statusbar-shift | 292 | Owner-kept feature (R1): the 20px Hermes status bar sits under the window, so everything a |
| wireframe-user-bubble-nesting | 52 | Wireframe quirk: .msg-u sets max-width:80% inside a flex item that is already 80% wide, so |
| wireframe-user-bubble-wrap-shift | 136 | Consequence of the wireframe's nested max-width:80% (see wireframe-user-bubble-nesting): i |
| owner-kept-restore-checkpoint | 26 | Owner-kept feature (R1): a Restore checkpoint button follows the time at the end of a prom |
| reply-action-row-per-reply | 217 | The wireframe draws a hover action row (Copy, thumbs up and down, Retry) under every assis |
| reply-actions-row-shift | 276 | The wireframe draws each assistant paragraph with its own hover action row (Copy, thumbs,  |
| running-spinner-box | 9 | The wireframe's running spinner is the 7.5px text glyph '◌'; the build draws a 14px braill |
| running-label-shift | 3 | Consequence of running-spinner-box: the running label starts after a 14px spinner instead  |
| wireframe-failed-offline-keep-waiting | 4 | Wireframe quirk: in its failed and offline states the focused chat's sidebar row stays Wai |
| failed-command-row-shift | 5 | The failed command keeps its own 36px step row plus the 14px gap above the error card (see |
| owner-kept-error-dismiss | 2 | Owner-kept feature: the failure card keeps its Dismiss error button, which takes a 24px co |
| banner-glyph-box | 1 | The offline banner's leading '○' is a 12px outlined-circle icon with an 8px gap, wider tha |
| offline-composer-disabled | 3 | Offline the build disables the composer (placeholder 'Reconnecting to Vanta…', model and e |
| w-composite-aria-roles | 53 | Workbench tabs and palette rows are real tab and option widgets (roving arrows, aria-selec |
| w-code-keeps-line-breaks | 7 | Wireframe .code has no white-space:pre, so its multi-line diff, tree and terminal text col |
| w-icon-box-width | 18 | A Tabler icon box replaces a text glyph whose advance differs per glyph, so a row title li |
| open-chat-row-tint | 4 | Hermes tints the row of a chat that is open in a pane even while a page is showing (open-i |
| expanded-step-body | 7 | See expanded-step-rows: the expanded body is a list of rows, not a one-line comma list in  |
| expanded-step-rows | 12 | An expanded 'Read 3 files' lists each file as its own step row (Read webhooks.ts, ...; Her |
| owner-kept-queue-controls | 6 | Owner-kept feature: a queued message keeps its Edit and Steer buttons beside Remove, so th |
| w-rail-rule-leak | 2 | Wireframe rule .w1100 .badge{display:none} targets the sidebar rail but also hides Home's  |
| titlebar-left-cluster-shift-narrow | 6 | At 800px the wireframe also draws a drawer button before New chat, so only the native traf |

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

