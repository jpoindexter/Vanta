# Reachability proof, 2026-10-13

Run: `node tools/reachability.mjs` against the built app (Electron shell, real Vanta server, sandboxed home, off-screen window, 1440x900).

PASS = present, visible, enabled. INERT = present but its backend or native call is not wired (expected). FAIL = missing or not clickable. DROPPED = removed on purpose. NOT-RUN = needs state the sandbox lacks.

Totals: PASS 50, INERT 18, NOT-RUN 24, DROPPED 6

| Area | PASS | INERT | FAIL | DROPPED | NOT-RUN |
|---|---|---|---|---|---|
| titlebar | 7 | 1 | 0 | 1 | 2 |
| sidebar top | 12 | 0 | 0 | 0 | 2 |
| sidebar list | 14 | 9 | 0 | 1 | 7 |
| profile rail | 3 | 4 | 0 | 2 | 2 |
| bots tab | 1 | 2 | 0 | 0 | 5 |
| status bar | 7 | 2 | 0 | 2 | 6 |
| palette | 3 | 0 | 0 | 0 | 0 |
| settings | 3 | 0 | 0 | 0 | 0 |

| ID | Area | Control | Result | Note |
|---|---|---|---|---|
| F-001 | titlebar | Show/Hide sidebar | PASS |  |
| F-002 | titlebar | Open settings (gear) | PASS | sidebar footer gear too |
| F-003 | titlebar | Layout editor | PASS |  |
| F-004 | titlebar | HUD mode | INERT | hud.* is typed-unsupported until R2 wires the mini window |
| F-005 | titlebar | Swap sidebar sides | PASS |  |
| F-006 | titlebar | Show/Hide right sidebar | PASS |  |
| F-007 | titlebar | Unread badge on sidebar toggle | NOT-RUN | needs a finished-unread chat; badge renders from $unreadSessionCount |
| F-008 | titlebar | Titlebar plugin slots | NOT-RUN | no page projects titlebar chrome in the default app |
| F-009 | titlebar | App-actions side preference | DROPPED | removed by owner decision |
| F-010 | titlebar | Window controls inset | PASS | --vs-lights-inset=90px |
| F-011 | titlebar | Interface mode (More menu) | PASS |  |
| F-012 | sidebar top | New session row | PASS |  |
| F-013 | sidebar top | Open in split (New session menu) | PASS | menu item present; split drop is pointer-driven |
| F-014 | sidebar top | Skills & tools row opens its page | PASS |  |
| F-015 | sidebar top | Connections row opens its page | PASS |  |
| F-016 | sidebar top | Outputs row opens its page | PASS |  |
| F-017 | sidebar top | Schedules row opens its page | PASS |  |
| F-018 | sidebar top | Home row and dashboard | PASS |  |
| F-019 | sidebar top | Contributed nav rows | NOT-RUN | no plugin contributes a row by default (Kanban ships off) |
| F-020 | sidebar top | Search sessions field | PASS | typed a query and the chat matched (server search is not served: client filter only) |
| F-021 | sidebar top | Storage-corrupt banner | NOT-RUN | Hermes state.db specific; Vanta has no equivalent |
| F-022 | sidebar top | Sidebar blank state | PASS |  |
| F-023 | sidebar top | Sidebar width 275px | PASS | measured at 1440 wide |
| F-024 | sidebar top | Tour anchors on nav rows | PASS | 6 anchors |
| F-025 | sidebar top | SESSIONS | BOTS tab strip | PASS |  |
| F-026 | sidebar list | Pinned section (collapse) | PASS |  |
| F-027 | sidebar list | Sessions section header | PASS |  |
| F-028 | sidebar list | Month / date dividers | NOT-RUN | all sandbox chats are from today; dividers need older chats |
| F-030 | sidebar list | Session row (dot, title, age) | PASS |  |
| F-031 | sidebar list | Row open gestures | PASS | plain click opens the chat |
| F-032 | sidebar list | Row menu: Rename… | PASS |  |
| F-033 | sidebar list | Row menu: Pin | PASS |  |
| F-034 | sidebar list | Row menu: Mark as unread | INERT | unread watermark route not served by Vanta |
| F-035 | sidebar list | Row menu: Branch | INERT | session.branch is unsupported in the bridge |
| F-036 | sidebar list | Row menu: Export | INERT | selectSavePath / writeTextFile are stubbed |
| F-037 | sidebar list | Row menu: Copy ID | PASS |  |
| F-038 | sidebar list | Row menu: Move to project | INERT | projects.* is not served by Vanta |
| F-039 | sidebar list | Row menu: Open in terminal | INERT | openSessionInTerminal is removed (exec) |
| F-040 | sidebar list | Row menu: Archive / Delete | PASS |  |
| F-041 | sidebar list | Tab-surface menu | NOT-RUN | needs a second tab |
| F-042 | sidebar list | Mark all as read | NOT-RUN | shown only while a chat is unread |
| F-043 | sidebar list | Section header + | PASS |  |
| F-044 | sidebar list | Filter menu: Grouping choices | PASS | choices: Updated / Project / Status / Gateway & profile |
| F-045 | sidebar list | Filter menu: Ordering | PASS |  |
| F-046 | sidebar list | Filter menu: Show (row meta) | PASS |  |
| F-047 | sidebar list | Filter menu: Filters, Archived, Reset | INERT | PR bucket filter needs /api/profiles/sessions/pull-requests (not served) |
| F-048 | sidebar list | Project lanes | NOT-RUN | project grouping needs the Project grouping option; groups derive from cwd |
| F-049 | sidebar list | Project menu | NOT-RUN | needs an entered project lane |
| F-050 | sidebar list | New project dialog | INERT | opens; creating a project needs projects.create (not served by Vanta) |
| F-051 | sidebar list | Open folder (⌘O / palette) | INERT | native folder picker; opens only in a visible window |
| F-052 | sidebar list | New worktree dialog (⌘⇧B) | INERT | git.worktree* is stubbed (exec removed) |
| F-053 | sidebar list | Messaging platform groups | NOT-RUN | no messaging threads in the sandbox |
| F-054 | sidebar list | CRON JOBS section | PASS | job row from /api/schedules via the cron adapter |
| F-055 | sidebar list | Gateway/profile group headers | DROPPED | removed by owner decision |
| F-056 | sidebar list | Load more row | NOT-RUN | needs more chats than one page |
| F-057 | sidebar list | Empty state for the list | PASS |  |
| F-058 | profile rail | Profile rail strip | PASS |  |
| F-059 | profile rail | Home button (default / all profiles) | PASS |  |
| F-060 | profile rail | Profile squares | NOT-RUN | only the default profile exists (profile routes are not served) |
| F-061 | profile rail | + New profile | INERT | creating needs POST /api/profiles (not served) |
| F-062 | profile rail | Import profile | INERT | import needs POST /api/profiles/import (not served) |
| F-063 | profile rail | ... Manage profiles | INERT | page opens; edits need /api/profiles/* (not served) |
| F-064 | profile rail | Plug / Manage gateways | DROPPED | removed by owner decision |
| F-065 | profile rail | Fleet groups and This device switch | DROPPED | removed by owner decision |
| F-066 | profile rail | Profile right-click menu | NOT-RUN | needs a named profile square |
| F-067 | profile rail | Profile dialogs (create) | INERT | dialog opens; save needs the profile route |
| F-068 | profile rail | No identity chip in the footer | PASS |  |
| F-069 | bots tab | BOTS tab | PASS |  |
| F-070 | bots tab | Roster toolbar (search, New…) | INERT | roster needs the profiles list (not served); toolbar renders |
| F-071 | bots tab | Bot row | NOT-RUN | roster is empty without a profiles route |
| F-072 | bots tab | New Bot dialog | INERT | reachable from the roster toolbar and palette; saving needs POST /api/profiles |
| F-073 | bots tab | Group chats | NOT-RUN | kept in the tree and hidden until server support exists (owner decision) |
| F-074 | bots tab | Routines pane | NOT-RUN | registers only with a bot focused |
| F-075 | bots tab | Screen portal | NOT-RUN | needs a bot with a computer; target is the Workbench Browser tab |
| F-076 | bots tab | @bot mentions | NOT-RUN | roster empty |
| F-077 | status bar | Status bar context menu (Show in status bar) | PASS |  |
| F-078 | status bar | Command center glyph | PASS |  |
| F-079 | status bar | Gateway switcher | DROPPED | removed by owner decision |
| F-080 | status bar | Compact profile switcher | NOT-RUN | shown only when the profile rail is hidden |
| F-081 | status bar | Backend health chip | PASS |  |
| F-082 | status bar | Free-tier chip | DROPPED | removed by owner decision |
| F-083 | status bar | Workspace chip | PASS |  |
| F-084 | status bar | Agents chip | INERT | subagent progress has no route; chip opens the overlay |
| F-085 | status bar | Cron and Webhooks chips | PASS |  |
| F-086 | status bar | Session timer | PASS |  |
| F-087 | status bar | Context meter | NOT-RUN | session.usage is not served; the meter appears once usage arrives |
| F-088 | status bar | Cache hit / tokens per second | NOT-RUN | hidden by default (menu toggles); no usage events |
| F-089 | status bar | RAM / system resources | NOT-RUN | shown when /api/runtime reports memory; not in this sandbox |
| F-090 | status bar | Approval-mode pill | PASS |  |
| F-091 | status bar | Terminal toggle | INERT | node-pty removed; toggle opens the pane |
| F-092 | status bar | Version / build chip | NOT-RUN |  |
| F-093 | status bar | Contributed status items | NOT-RUN | no contribution registered by default |
| PAL | palette | Command palette (⌘K) | PASS |  |
| PAL-HOME | palette | Palette: Home / New session / Settings rows | PASS |  |
| PAL-NOPET | palette | Palette has no Pets / Memory Graph rows | PASS |  |
| SET | settings | Settings opens with sections | PASS |  |
| SET-NOBILL | settings | Settings has no Billing section | PASS |  |
| SET-NOGW | settings | Settings has no Gateways section | PASS |  |

Renderer errors seen (18): Error: unsupported: getOnBattery is not available in Vanta Desktop yet ; Error: unsupported: desktopPluginsRoot is not available in Vanta Desktop yet ; Error: unsupported: signalDeepLinkReady is not available in Vanta Desktop yet ; Error: unsupported: getRemoteDisplayReason is not available in Vanta Desktop yet ; Error: unsupported: signalDeepLinkReady is not available in Vanta Desktop yet ; Error: unsupported: signalDeepLinkReady is not available in Vanta Desktop yet
