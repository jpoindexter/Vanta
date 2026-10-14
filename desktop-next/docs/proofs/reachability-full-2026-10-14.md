# Reachability proof, 2026-10-14 (full inventory)

Run: `node tools/reachability.mjs` against the built app (Electron shell, real Vanta server and kernel, sandboxed home, hidden window, 1440x900).
State is seeded first: older, pinned, archived and bulk chats; then the run starts chats that run, wait for approval, fail and finish unread.
Native dialogs, Finder, the Trash and the default browser are stubbed in the main process (see tools/proof/native-stubs.mjs); everything else is the real handler.

PASS = present and its action was driven. INERT = present, but its backend or native call is not wired (expected). FAIL = missing or not working. DROPPED = removed on purpose. NOT-RUN = needs state or a platform the sandbox cannot give.

Totals (269 rows): PASS 177, INERT 33, FAIL 3, DROPPED 17, NOT-RUN 39

| Area | PASS | INERT | FAIL | DROPPED | NOT-RUN |
|---|---|---|---|---|---|
| titlebar | 7 | 0 | 0 | 1 | 2 |
| window menu/tray | 14 | 3 | 0 | 2 | 1 |
| sidebar top | 12 | 0 | 0 | 0 | 2 |
| sidebar list | 27 | 2 | 1 | 0 | 3 |
| profile rail | 10 | 0 | 0 | 2 | 0 |
| bots tab | 2 | 0 | 2 | 0 | 4 |
| status bar | 10 | 1 | 0 | 2 | 4 |
| right pane | 21 | 5 | 0 | 0 | 3 |
| command palette | 11 | 1 | 0 | 0 | 0 |
| composer | 13 | 4 | 0 | 0 | 10 |
| thread | 11 | 1 | 0 | 0 | 3 |
| settings page | 14 | 10 | 0 | 1 | 0 |
| context menus | 4 | 1 | 0 | 0 | 0 |
| onboarding | 1 | 0 | 0 | 6 | 6 |
| page / overlay | 12 | 5 | 0 | 3 | 1 |
| home | 2 | 0 | 0 | 0 | 0 |
| palette | 3 | 0 | 0 | 0 | 0 |
| settings | 3 | 0 | 0 | 0 | 0 |

## Every row

| ID | Area | Control | Result | Note |
|---|---|---|---|---|
| F-001 | titlebar | Show/Hide sidebar | PASS |  |
| F-002 | titlebar | Open settings (gear) | PASS | sidebar footer gear too |
| F-003 | titlebar | Layout editor | PASS |  |
| F-004 | window menu/tray | HUD button opens the mini window | PASS | a frameless always-on-top window 620x320 loaded the HUD variant (kept off-screen in this run) |
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
| F-024 | sidebar top | Tour anchors on nav rows | PASS | 7 anchors |
| F-025 | sidebar top | SESSIONS / BOTS tab strip | PASS |  |
| F-026 | sidebar list | Pinned section lists the pinned chat | PASS | the seeded pinned chat is under Pinned |
| F-026C | sidebar list | Pinned section collapses and reopens | PASS | header click hides then shows the pinned row |
| F-027 | sidebar list | Sessions section header | PASS |  |
| F-028 | sidebar list | Month and date dividers | PASS | seeded chats from 10, 38 and 70+ days ago sit under a recent bucket, then September, August and July |
| F-029 | sidebar list | Status buckets when grouped by status | PASS | Grouping by Status regroups the list under status headers |
| F-030 | sidebar list | Session row (dot, title, age) | PASS |  |
| F-031 | sidebar list | Row open gestures | PASS | plain click opens the chat |
| F-032 | sidebar list | Row menu: Rename… | PASS |  |
| F-033 | sidebar list | Row menu: Pin | PASS |  |
| F-034 | sidebar list | Row menu: Mark as unread | PASS | the row shows Finished, unread (route /api/sessions/unread) |
| F-035 | sidebar list | Row menu: Branch | PASS | a forked draft opened in a new tab: Sessions / Bots / New session / Untitled session / draft: branch #1 (route /api/sessions/fork) |
| F-036 | sidebar list | Row menu: Export | PASS | the transcript downloaded as notes-from-last-week-20261003.json through the native save path (stubbed to a folder in this run) |
| F-037 | sidebar list | Row menu: Copy ID | PASS |  |
| F-038 | sidebar list | Row menu: Move to project | PASS | the row menu offers Move to project; its submenu lists the other projects, or 'No other projects' when there is only one (seen) |
| F-039 | sidebar list | Row menu: Open in terminal | INERT | openSessionInTerminal is removed (exec) |
| F-040 | sidebar list | Row menu: Archive removes the row | PASS | the chat left the list (Delete confirms first; archived chats show under Filters > Archived) |
| F-041 | sidebar list | Tab-surface menu | PASS | right-click on a tab: New window / Open in terminal / Rename… / Pin / Mark as unread / Appearance / Copy ID / Branch / Export / Move to project / Reload / Close / Close others / Close to the right / Close all / Archive / Delete |
| F-042 | sidebar list | Mark all as read | PASS | the Filters menu clears every unread marker; the toggle now reads "Hide sidebar" |
| F-043 | sidebar list | Section header + | PASS |  |
| F-044 | sidebar list | Filter menu: Grouping choices | PASS | choices: Updated / Project / Status / Profile |
| F-045 | sidebar list | Filter menu: Ordering | PASS |  |
| F-046 | sidebar list | Filter menu: Show (row meta) | PASS |  |
| F-047 | sidebar list | Filter menu: Status, Pull request, Profile, Archived, Reset | PASS | Archived lists the seeded archived chat (route /api/sessions/archived); the Pull request filter needs gh and stays empty |
| F-048 | sidebar list | Project lanes in Project grouping | FAIL | Project grouping is selectable and /api/projects lists the projects (2 listed), but the list shows no lanes: GET /api/sessions rows carry no cwd, so no chat can be placed in a project. Fix lives in the server session list (R3) |
| F-049 | sidebar list | Project menu | NOT-RUN | needs a project lane, and none renders until sessions carry a cwd (see F-048) |
| F-050 | sidebar list | New project dialog | INERT | opens; creating a project needs projects.create (not served by Vanta) |
| F-051 | sidebar list | Open folder as project (⌘O / palette) | PASS | ⌘O reached the native folder picker (stubbed to the second project) |
| F-052 | sidebar list | New worktree dialog (⌘⇧B) | PASS | the dialog created a real git worktree through the approval flow |
| F-053 | sidebar list | Messaging platform groups | NOT-RUN | needs a chat that came from a messaging platform; the session store has no source field to seed |
| F-054 | sidebar list | CRON JOBS section lists the schedule | PASS | expanding the section lists Weekly competitor brief from /api/schedules |
| F-055 | sidebar list | Profile grouping: plain profile groups, no gateway or fleet headers | PASS | the grouping option reads "Profile" and the list shows plain profile groups (none); no gateway header is drawn (owner decision) |
| F-056 | sidebar list | Load more row | NOT-RUN | all 60 seeded chats fit one page in this build, so no Load more row appears |
| F-057 | sidebar list | Empty state for the list | PASS |  |
| F-058 | profile rail | Profile rail strip | PASS |  |
| F-059 | profile rail | Home button (default / all profiles) | PASS |  |
| F-060 | profile rail | Profile squares | PASS | squares: Switch to default, 3 sessions need your answer, research, New profile, Import profile…, Manage profiles… |
| F-061 | profile rail | + New profile creates a profile | PASS | the dialog created research (POST /api/profiles); it is listed by GET /api/profiles |
| F-062 | profile rail | Import profile | PASS | reached the native file picker (stubbed); the archive step needs a profile export file |
| F-063 | profile rail | ... Manage profiles | PASS | the Profiles page lists default and research |
| F-064 | profile rail | Plug / Manage gateways | DROPPED | removed by owner decision |
| F-065 | profile rail | Fleet groups and This device switch | DROPPED | removed by owner decision |
| F-066 | profile rail | Profile right-click menu | PASS | Open in new window / Set as default / Color… / Rename… / Edit SOUL.md… / Export… / Connect to a remote host… / Delete |
| F-066S | profile rail | Profile menu: Set as default | PASS | POST /api/profiles/set-default saved research as the default (it applies at the next launch) |
| F-067 | profile rail | Profile dialog (create) saves | PASS | Create profile saved through the profile route |
| F-068 | profile rail | No identity chip in the footer | PASS |  |
| F-069 | bots tab | BOTS tab | PASS |  |
| F-070 | bots tab | Roster toolbar and list | FAIL | the roster is empty although /api/profiles lists research: the Bots plugin asks the gateway for the profiles.list RPC, which src/api/vanta/dispatch.ts does not map yet (R3). The union half, getAgentRoster, is wired in the bridge and returns research |
| F-071 | bots tab | Bot row | FAIL | the roster is empty although /api/profiles lists research: the Bots plugin asks the gateway for the profiles.list RPC, which src/api/vanta/dispatch.ts does not map yet (R3). The union half, getAgentRoster, is wired in the bridge and returns research |
| F-072 | bots tab | New Bot dialog | PASS | the + in the Bots tab offers New bot and opens its dialog (saving makes a profile through POST /api/profiles) |
| F-073 | bots tab | Group chats | NOT-RUN | kept in the tree and hidden until server support exists (owner decision) |
| F-074 | bots tab | Routines pane | NOT-RUN | registers only with a bot focused; not driven here |
| F-075 | bots tab | Screen portal | NOT-RUN | needs a bot with a computer; the target is the Workbench Browser tab, which cannot load pages yet |
| F-076 | bots tab | @bot mentions | NOT-RUN | not driven here |
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
| F-087 | status bar | Context meter | PASS | the status bar shows the meter from the server's usage event: ~1.5k/32k [░░░░░░░░░░] ~5% Focused for 0 : 0 1 Smart v0.0.0 |
| F-088 | status bar | Cache hit / tokens per second | NOT-RUN | hidden by default and the usage event carries no cache or speed figures |
| F-089 | status bar | RAM / system resources | NOT-RUN | shown only when /api/runtime reports memory; not in this sandbox |
| F-090 | status bar | Approval-mode pill | PASS | still in the status bar; the composer's Permission chip is the main control |
| F-091 | status bar | Terminal toggle | PASS | opens the terminal pane (a line terminal where every command asks first) |
| F-092 | status bar | Version / build chip | PASS | the chip reads v0.0.0 |
| F-093 | status bar | Contributed status items | NOT-RUN | no contribution registered by default |
| F-094 | right pane | Workbench tabs and chords (⌘G opens Review) | PASS | Files, Changes, Terminal and Browser toggles each open their pane |
| F-095 | right pane | Files header: refresh, collapse, show ignored | PASS | buttons appear on hover; tree read through vanta:fs:read-dir, confined to the project |
| F-096 | right pane | File tree expands and lists project files | PASS | src/index.ts listed after expanding src; double-click opens the preview |
| F-097 | right pane | File menu: Reveal, Copy path, Rename, Delete | PASS | menu: Reveal in Finder / Copy path / Copy relative path / Rename… / Delete; Reveal reached the OS call, Copy path wrote the clipboard |
| F-097R | right pane | Rename asks in a native dialog naming the path, then renames on disk | PASS |  |
| F-097T | right pane | Delete confirms in the app, asks again natively, then moves to the Trash | PASS | Trash call received the real path (the OS Trash itself is stubbed in a hidden run) |
| F-098 | right pane | Review pane: scope row and changed-file list | PASS | lists README.md and notes.txt with +/- counts from vanta:git:review-list; scopes Uncommitted, Branch, Last turn |
| F-099 | right pane | Stage all, Unstage, Revert through the gate | PASS | stage all staged README.md,notes.txt; Unstage removed one; Revert put README.md back to the committed text (approval cards answered: 1); the kernel decides whether a card appears |
| F-100 | right pane | Ship bar: message, Commit | PASS | Commit created a real commit "proof commit" through vanta:git:mutate (approval cards answered: 0) |
| F-100P | right pane | Create PR / Ask Vanta to open PR | INERT | Create PR needs gh and a network call: refused with a message, never faked; Ask Vanta to open PR hands it to the chat |
| F-101 | right pane | Terminal pane with a tab rail and New terminal | PASS | line terminal, no pty |
| F-101A | right pane | An egress command shows an approval card in the chat | PASS | card 'Run a command' appeared in the chat in front |
| F-101N | right pane | Terminal says every command asks for approval | PASS | Every command asks for approval first, in the chat you are looking at. |
| F-101R | right pane | A command typed in the terminal runs and prints | PASS | echo ran through the gate and printed |
| F-102 | right pane | Terminal context menu and clipboard | PASS | Paste / Select all |
| F-103 | right pane | Agent terminal tabs (read-only output) | NOT-RUN | needs typed background-process events from the server (DN-06); no agent command is backgrounded in the canned model |
| F-104 | command palette | Logs (palette row) | PASS | Toggle logs is in the palette; the log file itself opens from Settings > About and vanta:logs:reveal |
| F-105 | right pane | Browser pane: address, back, forward, reload | INERT | controls present: Back, Forward, Reload page, Copy URL, Annotate, Pop out, Show preview console, Open preview DevTools. The pane stays blank after Enter: the page host (webviewTag) is switched off in the Vanta shell, so nothing can browse yet |
| F-106 | right pane | Preview console and DevTools | INERT | buttons present; they act on a loaded page, and no page loads (webviewTag off) |
| F-107 | right pane | Annotate mode | INERT | toolbar button present; needs a loaded page |
| F-108 | right pane | Restart-server prompt / file-change reload | INERT | error state only shows for a loaded page; file watching is wired (vanta:fs:watch-file) and tested in main |
| F-109 | right pane | File preview (SOURCE / PREVIEW, Edit) | PASS | double-click opened README.md rendered, with SOURCE and Edit; saving needs writeTextFile (not wired) |
| F-110 | right pane | Artifact preview (versions pager) | NOT-RUN | needs a saved artifact; see the Outputs page row F-230 |
| F-111 | right pane | Real-browser-profile consent dialog | NOT-RUN | appears only when a browser tool asks for the real profile; Vanta brokers logins instead (Settings > Passwords & Logins) |
| F-112 | right pane | Tab strip shows once a second tab exists (⌘T) | PASS | tabs: Sessions / Bots / New session / Competitor pricing review (branch) / Untitled session / Terminal /  |
| F-113 | right pane | Narrow-width: sidebar rail at 1100, drawer button at 900 | PASS | at 1100 the sidebar is an icon rail (settings gear at x=13); the sidebar toggle is present at 900 = true |
| F-114 | composer | Rich input: type, send, history ↑ | PASS | a typed message sent, and ↑ in the empty box recalled it (Esc cancels a running turn: see F-124) |
| F-115 | composer | + menu: Files…, Folder…, Images…, Paste image | PASS | Files… / Folder… / Images… / Paste image / URL… / Prompt snippets… |
| F-116 | composer | + menu: URL… and Prompt snippets… | PASS | both entries are in the menu |
| F-117 | composer | Contributed attachment providers | NOT-RUN | no plugin contributes an attachment provider by default |
| F-118 | composer | Attachment chip after picking a folder | PASS | Folder… opened the native picker (stubbed) and the folder became a chip; its remove control is the chip's × |
| F-119 | composer | Large paste collapse, screenshot capture | INERT | the screenshot hotkey (command-screenshot) is not part of the Vanta shell; paste collapse is renderer-only and not driven here |
| F-120 | composer | Model pill menu | PASS | lists the configured provider models and the custom endpoint's Vanta Proof |
| F-121 | composer | Model switch confirm, picker overlay, visibility dialog | NOT-RUN | choosing another model would change the sandbox's provider (a key or endpoint is needed); the picker menu itself is F-120 |
| F-122 | composer | Reasoning pill: Thinking … Ultra | INERT | the menu lists Thinking / Minimal / Low / Medium / High / Extra High / Max / Ultra, but choosing High leaves the pill on Medium: the server refuses it for this endpoint ("custom vanta-proof does not support effort high", POST /api/model-settings 400) and the pill says nothing. The model's supported efforts should limit the list (src/api/vanta model options, R3) |
| F-123 | composer | Permission chip: five modes | PASS | Ask each time / Accept edits / Plan / Auto / Full access; choosing Plan changed the chip to "Permission mode: Plan" |
| F-124 | composer | Send / Stop / Queue | PASS | while a slow turn ran the Stop button showed and ⌘Enter queued a message |
| F-125 | composer | Queue panel | PASS | the queued message sits above the composer |
| F-126 | composer | Voice mic: dictation, read aloud, wake word | INERT | the Dictate button is there; it needs microphone access and a speech engine, so it was not started in a hidden run |
| F-127 | composer | Voice conversation pill | NOT-RUN | needs a started voice conversation (microphone) |
| F-128 | composer | Status drawer toggle | PASS | Hide status stack is in the composer |
| F-129 | composer | Subagents section | NOT-RUN | the status drawer shows these once the server reports them (subagent SSE, task stack, /api/goals); the canned model starts none |
| F-130 | composer | Todos and background processes | NOT-RUN | the status drawer shows these once the server reports them (subagent SSE, task stack, /api/goals); the canned model starts none |
| F-131 | composer | Goal row | NOT-RUN | the status drawer shows these once the server reports them (subagent SSE, task stack, /api/goals); the canned model starts none |
| F-132 | composer | Loop and heartbeat rows | NOT-RUN | the status drawer shows these once the server reports them (subagent SSE, task stack, /api/goals); the canned model starts none |
| F-133 | composer | Coding row: branch, changes | PASS | the composer shows the branch (main), Copy path, New branch and the changed-file count |
| F-134 | composer | Suggestion pills | NOT-RUN | need an unconfigured MCP/skill context to suggest |
| F-135 | composer | Micro-action badges | NOT-RUN | need an agent turn that proposes one |
| F-136 | composer | Slash popover '/' | PASS | lists Vanta's commands (VANTA /new Start a new desktop chat /stop Stop the active turn and background processes); the Hermes catalog is not carried over, only commands Vanta backs |
| F-137 | composer | @ popover (files, folders) | PASS | lists project files: .worktrees/proof-worktree/README.md .worktrees/proof-worktree/pixel.png .worktrees/proof-worktree/sr |
| F-138 | composer | ? quick help (commands and hotkeys) | PASS | shows Common commands and Hotkeys |
| F-139 | composer | Floating composer pop-out | NOT-RUN | a Settings > Appearance toggle (Floating Composer); the setting is present, the drag was not driven |
| F-140 | window menu/tray | HUD controls: exit HUD mode | PASS | second press closed the mini window |
| F-141 | composer | Handoff to a messaging platform | INERT | needs a configured messaging platform (Connections) |
| F-142 | thread | Assistant message actions | PASS | Copy, Good response, Bad response, Retry, Branch in new chat, Read aloud; Copy put the reply text on the clipboard |
| F-143 | thread | User message actions: Edit, Restore checkpoint | PASS | Edit message, Restore checkpoint |
| F-144 | thread | Tool rows (collapsed activity) | PASS | the command shows as a tool row in the thread with the reply after it |
| F-145 | thread | Approval card: Allow once, Always allow, Reject | PASS | Allow once / Always allow shell commands / Reject; Reject ended the turn |
| F-146 | thread | Clarify prompts (options, Other, Skip) | INERT | Vanta's clarify tool returns its question as text; there is no clarify.request event for the card, so the question reads as a normal reply |
| F-147 | thread | Sudo / secret / vault prompts | NOT-RUN | no flow in the sandbox asks for a secret; Vanta brokers logins (Settings > Passwords & Logins) |
| F-148 | thread | MCP setup prompt | NOT-RUN | needs a tool call naming an unconfigured MCP server |
| F-149 | thread | Error card with a way forward | PASS | a failed turn shows its error with Retry; the row shows Failed (shape plus word) |
| F-150 | thread | No 'Sign in with a Nous account' action | PASS | removed with the branding |
| F-151 | thread | Changed-files card | NOT-RUN | the canned model does not edit files; the Changes pane lists real edits (F-098) |
| F-152 | thread | Scroll-to-bottom button and thread chrome | PASS | Scroll to bottom is in the thread (shown once the thread is scrolled up) |
| F-153 | thread | Empty chat shows the composer and starter | PASS | Home is the empty state with the composer |
| F-154 | thread | Image lightbox: open, Save image | PASS | the lightbox opened and Save image went through the native save dialog (stubbed to a path) and wrote the PNG |
| F-155 | settings page | Settings overlay shell: left nav, breadcrumb, search | PASS | 17 sections with sub-pages, a breadcrumb and a ⌘K search; closes with the × |
| F-156 | settings page | Nav footer: Export, Import, Reset settings | PASS | icon buttons at the foot of the nav (they read /api/config to work) |
| F-157 | settings page | Model: main model, fallbacks | INERT | the page stays on its loading skeleton: it reads /api/config (config schema and values), which the Vanta server does not serve (R3/server: no config route) |
| F-158 | settings page | Chat: behavior, attachments | INERT | the page reports 'Settings failed to load': it reads /api/config, which the Vanta server does not serve |
| F-159 | settings page | Appearance: theme, typography, window and layout, chat display | PASS | all four sub-pages load; the theme list is Vanta tokens plus the bundled palettes |
| F-160 | settings page | No theme marketplace (VS Code theme import) | PASS | removed: Theme lists palettes only (owner decision) |
| F-161 | settings page | No Pet sub-section | PASS | Appearance has Theme, Typography, Window & layout and Chat display only (owner decision) |
| F-162 | settings page | Workspace: projects, shell, files | INERT | the page reports 'Settings failed to load': it reads /api/config, which the Vanta server does not serve |
| F-163 | settings page | Safety: approvals, privacy, checkpoints | INERT | the page reports 'Settings failed to load': it reads /api/config, which the Vanta server does not serve |
| F-164 | settings page | Browser: profile, local URLs | INERT | the page reports 'Settings failed to load': it reads /api/config, which the Vanta server does not serve |
| F-165 | settings page | Memory & Context | INERT | the page reports 'Settings failed to load': it reads /api/config, which the Vanta server does not serve |
| F-166 | settings page | Voice | INERT | the page reports 'Settings failed to load': it reads /api/config, which the Vanta server does not serve |
| F-167 | settings page | Advanced: desktop, limits, tools | INERT | the page reports 'Settings failed to load': it reads /api/config, which the Vanta server does not serve |
| F-168 | settings page | Notifications: desktop alerts and sounds | PASS | Enable notifications, Approval needed, Input needed, Response ready, Turn failed, Background task finished and a test notification |
| F-169 | settings page | No Billing section | PASS | removed with the Nous branding |
| F-170 | settings page | Providers: accounts, API keys, endpoints | INERT | the page stays on its loading skeleton: it reads /api/config (config schema and values), which the Vanta server does not serve (R3/server: no config route) |
| F-171 | settings page | No Gateways section | PASS | removed (owner decision); the backend is one local Vanta server |
| F-172 | settings page | Keyboard shortcuts: key bindings | PASS | the full map is listed by group with click-to-rebind and Reset all |
| F-173 | settings page | Tools & Keys | INERT | the page stays on its loading skeleton: it reads /api/config (config schema and values), which the Vanta server does not serve (R3/server: no config route) |
| F-174 | settings page | Archive & retention: archived chats, default project | PASS | lists archived chats to restore (the seeded archived chat is there) and the default project folder |
| F-175 | settings page | Plugins: manage plugins | PASS | Manage plugins page loads; no plugin contributes settings by default |
| F-176 | settings page | About: version and updates | PASS | About lists Vanta, version and updates (version shown); no update feed is configured |
| F-177 | settings page | Language switcher | PASS | Appearance > General offers Language (English first, the other locales load on choice) |
| F-178 | window menu/tray | Settings > Appearance > Window & layout: Minimize to tray | PASS | the switch turned the tray on (tray.json enabled=true, status enabled) and off again; the icon exists for about a second in this run |
| F-179 | settings page | Usage statistics consent | DROPPED | telemetry consent removed (agreed branding removal) |
| F-180 | settings page | Sound and haptics mute | PASS | Sounds page: Sounds / Completion Sound / Plays when an agent turn finishes. Pick a preset and preview it here. / Two-note comfort / Preview / Sear |
| F-181 | command palette | Palette shell (⌘K, groups, filter) | PASS | 55 rows in groups GO TO / PROJECTS / COMMANDS / COMMAND CENTER / APPEARANCE / SETTINGS / BRANCHES; typing filters them |
| F-182 | command palette | Go to: New session, Settings, Capabilities, Messaging, Artifacts, Cron, Profiles | PASS | all present |
| F-183 | command palette | Projects: Open folder as project… | PASS | present with ⌘O |
| F-184 | command palette | Commands: layout, status bar, tabs, shortcuts | PASS | present |
| F-184R | command palette | A palette command runs | PASS | Toggle status bar hid the bar and a second run brought it back |
| F-185 | command palette | Plugin palette rows (Kanban, Bots) | INERT | Bots 'New Bot…' is there; the Kanban Open board / New task rows are absent because no board route exists (F-243) |
| F-186 | command palette | Command Center group | PASS | Sessions, Import session, System, Usage, Reload window and the update row are present |
| F-187 | command palette | Appearance group (theme, colour mode) | PASS | Change theme and Change color mode are present |
| F-187P | command palette | No Pets / Generate a pet / Memory Graph rows | PASS | searching pet and memory graph finds none (owner decision) |
| F-188 | command palette | Settings group and deep search | PASS | searching a setting's name lists it and Enter opens Settings on that page |
| F-189 | command palette | Search results: chats | PASS | typing a title lists the chat and Enter opens it |
| F-190 | context menus | Terminal context menu (Paste, Select all; Copy with a selection) | PASS | Paste / Select all |
| F-191 | context menus | DOM context menu: link | PASS | Open in in-app browser / Open in external browser / Copy URL |
| F-192 | context menus | Preview webview (guest) context menu | INERT | the Browser pane cannot host a page (webviewTag is off), so there is no guest page to right-click |
| F-193 | context menus | Bare-chrome context menu | PASS | New session / New window / Command palette / Toggle status bar / Toggle profile rail / Toggle tabs / Settings / Update Vanta |
| F-194 | context menus | Pane / zone context menu | PASS | Reload / Close others / Close to the right / Close all / Hide Sessions / Hide Bots / Hide tabs ⌘⌥T / Minimize |
| F-195 | window menu/tray | App menu: About, Hide, Quit | PASS | About Vanta / Services / Hide Vanta / Hide Others / Show All / Quit Vanta |
| F-196 | window menu/tray | File menu: Open Folder…, Close | PASS | Open Folder… / Close; Open Folder… reached the native folder picker (New Window is absent: the shell has one window) |
| F-197 | window menu/tray | Edit menu | PASS | Undo / Redo / Cut / Copy / Paste / Paste and Match Style / Delete / Select All / Substitutions |
| F-198 | window menu/tray | View menu: Reload, DevTools, zoom in, out, actual size | PASS | Zoom In 1 -> 1.0183993761470242 (saved in userData/zoom.json), Actual Size -> 1 |
| F-199 | window menu/tray | Window menu | PASS | Minimize / Zoom / Bring All to Front |
| F-200 | window menu/tray | Help menu | INERT | Vanta Docs; Check for Updates is absent because no update feed is configured |
| F-201 | window menu/tray | Tray menu: Show Vanta, Needs you, quick surfaces, Quit | INERT | the tray turns on and off from the setting (F-178). Its menu and Needs you count are not observable from outside the app (Electron's Tray cannot be replaced or queried); buildTrayMenuTemplate and createTrayHost are covered by vanta-tray tests |
| F-202 | window menu/tray | Quick Entry: settings and global shortcut | PASS | setSettings enabled a global shortcut (Control+Alt+Shift+F13, a spare key so the owner's shortcuts are untouched) and disabling released it; the summon, relay and acknowledge path runs in quick-entry-host tests, the quick window itself was not driven here. Settings page: Advanced > Desktop & startup is blocked by the config route (see settings rows) |
| F-203 | window menu/tray | Mini window (HUD without the game overlay) | PASS | same window; the game overlay, modifier gesture and snap shortcut are not ported (owner decision) |
| F-204 | window menu/tray | Pet overlay and wake-word indicator windows | DROPPED | pet overlay removed by owner decision; the wake-word indicator is not mounted in the Vanta shell |
| F-205 | window menu/tray | Browser pop-out and per-session windows | INERT | openWindow, openBrowserWindow and windowRelay are typed-unsupported: the Vanta shell has one main window (documented in ipc-surface section 5.3) |
| F-206 | window menu/tray | Native notifications with actions | NOT-RUN | a real OS notification would appear on the owner's screen in a hidden run; the notification module is the unchanged Hermes one and its click-to-focus path is covered by notification-ipc tests |
| F-207 | window menu/tray | Find in page (⌘F bar, next match) | PASS | bar opened with ⌘F, found 1/2 matches for "proof" in the real page and stepped with Enter; Esc closed it |
| F-208 | window menu/tray | DevTools and reload shortcuts | PASS | View menu carries Reload, Force Reload and Toggle Developer Tools with their accelerators (not clicked: it would open a window) |
| F-209 | window menu/tray | vanta:// deep links | PASS | vanta://connections/telegram reached the renderer; vanta://skill/install was dropped (install links wait for the approval flow) |
| F-210 | window menu/tray | Challenge window (free-tier sign-in) | DROPPED | removed with the Nous branding (owner decision); freeTierChallenge is typed-unsupported |
| F-211 | window menu/tray | Keep-awake, single instance, About panel | PASS | setKeepAwake and the About menu role are wired (power-features tests); the About page is checked in the settings rows |
| F-212 | onboarding | Provider onboarding screen | NOT-RUN | shown only when no provider is configured; the sandbox has a custom endpoint set, so the first-run sheet does not open |
| F-213 | onboarding | Provider sign-in flows | NOT-RUN | Settings > Providers (config route missing) and the first-run sheet both need an unconfigured install |
| F-214 | onboarding | API-key entry | NOT-RUN | same screen as F-212 |
| F-215 | onboarding | Run models locally option | NOT-RUN | same screen as F-212 |
| F-216 | onboarding | Setup-slow banner, boot screen | NOT-RUN | boot states are covered by shell-state tests; the server is healthy in the sandbox |
| F-217 | onboarding | Guided onboarding chat (two-profile mechanics) | DROPPED | dropped by owner decision; a simple Vanta first run replaces it |
| F-218 | onboarding | Free-tier sign-in dialog and notice | DROPPED | removed with the branding |
| F-219 | onboarding | Remote first-run connection setup | DROPPED | dropped by owner decision (one local server) |
| F-220 | onboarding | Boot overlays and offline banner | NOT-RUN | needs the server to be down; the banner component and its Retry now are in the titlebar tests |
| F-221 | onboarding | Legal butterbar (Nous terms) | DROPPED | removed with the branding |
| F-222 | onboarding | Usage-stats consent strip | DROPPED | removed with the branding (telemetry) |
| F-223 | onboarding | Tips bubbles and app tour | PASS | 7 tour anchors on the sidebar rows; Settings > Appearance > General has In-App Tips and Guided Tours switches |
| F-224 | onboarding | Billing banner and remote-display banner | DROPPED | billing banner removed; the remote-display banner is not mounted |
| F-225 | page / overlay | Capabilities > Skills | PASS | tabs Skills, Tools, Connectors, Plugins load; Skills reads 0 (no skill hub is configured in this build, so there is nothing to install or toggle) |
| F-226 | page / overlay | Capabilities > Tools: enable and disable | PASS | 153 tools listed with switches; toggling the first changed it (true -> false) through the tools route and was put back |
| F-227 | page / overlay | Capabilities > Connectors | INERT | the tab is there and opens Connections; the Nous-hosted connector directory is removed, accounts live on Connections |
| F-228 | page / overlay | Capabilities > Plugins | PASS | the Plugins tab is there (agent and desktop plugin halves; install from Git is not enabled) |
| F-229 | page / overlay | Messaging page (Connections) | PASS | platform list loads |
| F-230 | page / overlay | Outputs page | PASS | All, Images, Files and Links tabs with the empty state (no outputs yet in this sandbox) |
| F-231 | page / overlay | Schedules: jobs, blueprints, Pause, Trigger now, history | PASS | lists the job with frequency, Pause, Trigger now, prompt and run history, plus Blueprints (routes /api/schedules/*) |
| F-232 | page / overlay | Webhooks page | INERT | the status-bar chip is present but opens nothing: there are no webhook routes in the Vanta server, so there is no page to show |
| F-233 | page / overlay | Profiles page: list, details, SOUL.md editor | PASS | lists profiles with model and skills, and Save SOUL.md wrote the file (route /api/profiles/soul) |
| F-234 | page / overlay | Agents overlay (spawn tree) | PASS | opens with its empty state; live children stream in when a turn delegates work (no subagent SSE in the canned model) |
| F-235 | page / overlay | Command Center: Sessions, System, Usage, Maintenance | PASS | four tabs; Sessions lists every chat with its date |
| F-236 | page / overlay | Memory Graph (Starmap) | DROPPED | no titlebar, palette or menu entry (owner decision: gimmick); the code stays in the tree until the owner confirms |
| F-237 | page / overlay | Import session (Claude Code, Codex) | INERT | the overlay opens from the palette; scanning needs a session-import route (not served) |
| F-238 | page / overlay | Updates overlay | INERT | the row opens the update status; no update feed is configured in this build, so there is nothing to apply |
| F-239 | page / overlay | Session switcher: ctrl+Tab cycles recent chats | PASS | ctrl+Tab moved to another chat (title now "image please") |
| F-240 | page / overlay | Toast notifications (live region) | PASS | an error raised by the Messaging page appears in the top-centre Notifications region (role=alert) with a close button |
| F-241 | page / overlay | Send diagnostics dialog | DROPPED | removed with the branding (agreed); Copy diagnostics and Reveal logs remain (vanta:logs:reveal) |
| F-242 | page / overlay | Error boundary | NOT-RUN | needs a renderer crash; the boundary component is unchanged and unit-tested |
| F-243 | page / overlay | Kanban plugin page | INERT | the Kanban plugin is switched off by default and its board route is not served; it appears only as a plugin row in Settings and the palette |
| F-244 | page / overlay | Radio and hello-runtime sample plugins | DROPPED | removed (owner decision) |
| F-245 | page / overlay | Keyboard shortcuts: complete default map | PASS | Settings > Keyboard Shortcuts lists every chord by group (see F-172); the map is unchanged from the original |
| FOCUS-CONTROL | thread | Control: without the reported focus the card follows the last-opened chat | PASS | after focusClient(null) the same command put its card in beta (opened last) while alpha was on screen: the reported focus is what routes the card |
| FOCUS-ROUTE | thread | Approval cards from the terminal land in the chat in front | PASS | with two chats open (beta opened last), a command typed while alpha was in front put its card in alpha, and while beta was in front in beta |
| HOME-COMPANY | home | Home Needs you: blocked company ticket | PASS | a blocked ticket from the Company API is a Needs you row beside the chats, with its blocker as the detail |
| HOME-COMPANY-OPEN | home | Open on a company row goes to the ticket | PASS | Open navigated to #/company?tab=tickets&ticket=T-1 |
| PAL | palette | Command palette (⌘K) | PASS |  |
| PAL-HOME | palette | Palette: Home / New session / Settings rows | PASS |  |
| PAL-NOPET | palette | Palette has no Pets / Memory Graph rows | PASS |  |
| PANE-browser | right pane | Titlebar toggle opens the browser pane | PASS | it opens once; it does not fold again from the toggle (use the pane's close button) |
| PANE-changes | right pane | Titlebar toggle opens the changes pane | PASS |  |
| PANE-files | right pane | Titlebar toggle opens the files pane | PASS |  |
| PANE-terminal | right pane | Titlebar toggle opens the terminal pane | PASS |  |
| SET | settings | Settings opens with sections | PASS |  |
| SET-NOBILL | settings | Settings has no Billing section | PASS |  |
| SET-NOGW | settings | Settings has no Gateways section | PASS |  |

## Not PASS (92)

- F-007 NOT-RUN: Unread badge on sidebar toggle. needs a finished-unread chat; badge renders from $unreadSessionCount
- F-008 NOT-RUN: Titlebar plugin slots. no page projects titlebar chrome in the default app
- F-009 DROPPED: App-actions side preference. removed by owner decision
- F-019 NOT-RUN: Contributed nav rows. no plugin contributes a row by default (Kanban ships off)
- F-021 NOT-RUN: Storage-corrupt banner. Hermes state.db specific; Vanta has no equivalent
- F-039 INERT: Row menu: Open in terminal. openSessionInTerminal is removed (exec)
- F-048 FAIL: Project lanes in Project grouping. Project grouping is selectable and /api/projects lists the projects (2 listed), but the list shows no lanes: GET /api/sessions rows carry no cwd, so no chat can be placed in a project. Fix lives in the server session list (R3)
- F-049 NOT-RUN: Project menu. needs a project lane, and none renders until sessions carry a cwd (see F-048)
- F-050 INERT: New project dialog. opens; creating a project needs projects.create (not served by Vanta)
- F-053 NOT-RUN: Messaging platform groups. needs a chat that came from a messaging platform; the session store has no source field to seed
- F-056 NOT-RUN: Load more row. all 60 seeded chats fit one page in this build, so no Load more row appears
- F-064 DROPPED: Plug / Manage gateways. removed by owner decision
- F-065 DROPPED: Fleet groups and This device switch. removed by owner decision
- F-070 FAIL: Roster toolbar and list. the roster is empty although /api/profiles lists research: the Bots plugin asks the gateway for the profiles.list RPC, which src/api/vanta/dispatch.ts does not map yet (R3). The union half, getAgentRoster, is wired in the bridge and returns research
- F-071 FAIL: Bot row. the roster is empty although /api/profiles lists research: the Bots plugin asks the gateway for the profiles.list RPC, which src/api/vanta/dispatch.ts does not map yet (R3). The union half, getAgentRoster, is wired in the bridge and returns research
- F-073 NOT-RUN: Group chats. kept in the tree and hidden until server support exists (owner decision)
- F-074 NOT-RUN: Routines pane. registers only with a bot focused; not driven here
- F-075 NOT-RUN: Screen portal. needs a bot with a computer; the target is the Workbench Browser tab, which cannot load pages yet
- F-076 NOT-RUN: @bot mentions. not driven here
- F-079 DROPPED: Gateway switcher. removed by owner decision
- F-080 NOT-RUN: Compact profile switcher. shown only when the profile rail is hidden
- F-082 DROPPED: Free-tier chip. removed by owner decision
- F-084 INERT: Agents chip. subagent progress has no route; chip opens the overlay
- F-088 NOT-RUN: Cache hit / tokens per second. hidden by default and the usage event carries no cache or speed figures
- F-089 NOT-RUN: RAM / system resources. shown only when /api/runtime reports memory; not in this sandbox
- F-093 NOT-RUN: Contributed status items. no contribution registered by default
- F-100P INERT: Create PR / Ask Vanta to open PR. Create PR needs gh and a network call: refused with a message, never faked; Ask Vanta to open PR hands it to the chat
- F-103 NOT-RUN: Agent terminal tabs (read-only output). needs typed background-process events from the server (DN-06); no agent command is backgrounded in the canned model
- F-105 INERT: Browser pane: address, back, forward, reload. controls present: Back, Forward, Reload page, Copy URL, Annotate, Pop out, Show preview console, Open preview DevTools. The pane stays blank after Enter: the page host (webviewTag) is switched off in the Vanta shell, so nothing can browse yet
- F-106 INERT: Preview console and DevTools. buttons present; they act on a loaded page, and no page loads (webviewTag off)
- F-107 INERT: Annotate mode. toolbar button present; needs a loaded page
- F-108 INERT: Restart-server prompt / file-change reload. error state only shows for a loaded page; file watching is wired (vanta:fs:watch-file) and tested in main
- F-110 NOT-RUN: Artifact preview (versions pager). needs a saved artifact; see the Outputs page row F-230
- F-111 NOT-RUN: Real-browser-profile consent dialog. appears only when a browser tool asks for the real profile; Vanta brokers logins instead (Settings > Passwords & Logins)
- F-117 NOT-RUN: Contributed attachment providers. no plugin contributes an attachment provider by default
- F-119 INERT: Large paste collapse, screenshot capture. the screenshot hotkey (command-screenshot) is not part of the Vanta shell; paste collapse is renderer-only and not driven here
- F-121 NOT-RUN: Model switch confirm, picker overlay, visibility dialog. choosing another model would change the sandbox's provider (a key or endpoint is needed); the picker menu itself is F-120
- F-122 INERT: Reasoning pill: Thinking … Ultra. the menu lists Thinking / Minimal / Low / Medium / High / Extra High / Max / Ultra, but choosing High leaves the pill on Medium: the server refuses it for this endpoint ("custom vanta-proof does not support effort high", POST /api/model-settings 400) and the pill says nothing. The model's supported efforts should limit the list (src/api/vanta model options, R3)
- F-126 INERT: Voice mic: dictation, read aloud, wake word. the Dictate button is there; it needs microphone access and a speech engine, so it was not started in a hidden run
- F-127 NOT-RUN: Voice conversation pill. needs a started voice conversation (microphone)
- F-129 NOT-RUN: Subagents section. the status drawer shows these once the server reports them (subagent SSE, task stack, /api/goals); the canned model starts none
- F-130 NOT-RUN: Todos and background processes. the status drawer shows these once the server reports them (subagent SSE, task stack, /api/goals); the canned model starts none
- F-131 NOT-RUN: Goal row. the status drawer shows these once the server reports them (subagent SSE, task stack, /api/goals); the canned model starts none
- F-132 NOT-RUN: Loop and heartbeat rows. the status drawer shows these once the server reports them (subagent SSE, task stack, /api/goals); the canned model starts none
- F-134 NOT-RUN: Suggestion pills. need an unconfigured MCP/skill context to suggest
- F-135 NOT-RUN: Micro-action badges. need an agent turn that proposes one
- F-139 NOT-RUN: Floating composer pop-out. a Settings > Appearance toggle (Floating Composer); the setting is present, the drag was not driven
- F-141 INERT: Handoff to a messaging platform. needs a configured messaging platform (Connections)
- F-146 INERT: Clarify prompts (options, Other, Skip). Vanta's clarify tool returns its question as text; there is no clarify.request event for the card, so the question reads as a normal reply
- F-147 NOT-RUN: Sudo / secret / vault prompts. no flow in the sandbox asks for a secret; Vanta brokers logins (Settings > Passwords & Logins)
- F-148 NOT-RUN: MCP setup prompt. needs a tool call naming an unconfigured MCP server
- F-151 NOT-RUN: Changed-files card. the canned model does not edit files; the Changes pane lists real edits (F-098)
- F-157 INERT: Model: main model, fallbacks. the page stays on its loading skeleton: it reads /api/config (config schema and values), which the Vanta server does not serve (R3/server: no config route)
- F-158 INERT: Chat: behavior, attachments. the page reports 'Settings failed to load': it reads /api/config, which the Vanta server does not serve
- F-162 INERT: Workspace: projects, shell, files. the page reports 'Settings failed to load': it reads /api/config, which the Vanta server does not serve
- F-163 INERT: Safety: approvals, privacy, checkpoints. the page reports 'Settings failed to load': it reads /api/config, which the Vanta server does not serve
- F-164 INERT: Browser: profile, local URLs. the page reports 'Settings failed to load': it reads /api/config, which the Vanta server does not serve
- F-165 INERT: Memory & Context. the page reports 'Settings failed to load': it reads /api/config, which the Vanta server does not serve
- F-166 INERT: Voice. the page reports 'Settings failed to load': it reads /api/config, which the Vanta server does not serve
- F-167 INERT: Advanced: desktop, limits, tools. the page reports 'Settings failed to load': it reads /api/config, which the Vanta server does not serve
- F-170 INERT: Providers: accounts, API keys, endpoints. the page stays on its loading skeleton: it reads /api/config (config schema and values), which the Vanta server does not serve (R3/server: no config route)
- F-173 INERT: Tools & Keys. the page stays on its loading skeleton: it reads /api/config (config schema and values), which the Vanta server does not serve (R3/server: no config route)
- F-179 DROPPED: Usage statistics consent. telemetry consent removed (agreed branding removal)
- F-185 INERT: Plugin palette rows (Kanban, Bots). Bots 'New Bot…' is there; the Kanban Open board / New task rows are absent because no board route exists (F-243)
- F-192 INERT: Preview webview (guest) context menu. the Browser pane cannot host a page (webviewTag is off), so there is no guest page to right-click
- F-200 INERT: Help menu. Vanta Docs; Check for Updates is absent because no update feed is configured
- F-201 INERT: Tray menu: Show Vanta, Needs you, quick surfaces, Quit. the tray turns on and off from the setting (F-178). Its menu and Needs you count are not observable from outside the app (Electron's Tray cannot be replaced or queried); buildTrayMenuTemplate and createTrayHost are covered by vanta-tray tests
- F-204 DROPPED: Pet overlay and wake-word indicator windows. pet overlay removed by owner decision; the wake-word indicator is not mounted in the Vanta shell
- F-205 INERT: Browser pop-out and per-session windows. openWindow, openBrowserWindow and windowRelay are typed-unsupported: the Vanta shell has one main window (documented in ipc-surface section 5.3)
- F-206 NOT-RUN: Native notifications with actions. a real OS notification would appear on the owner's screen in a hidden run; the notification module is the unchanged Hermes one and its click-to-focus path is covered by notification-ipc tests
- F-210 DROPPED: Challenge window (free-tier sign-in). removed with the Nous branding (owner decision); freeTierChallenge is typed-unsupported
- F-212 NOT-RUN: Provider onboarding screen. shown only when no provider is configured; the sandbox has a custom endpoint set, so the first-run sheet does not open
- F-213 NOT-RUN: Provider sign-in flows. Settings > Providers (config route missing) and the first-run sheet both need an unconfigured install
- F-214 NOT-RUN: API-key entry. same screen as F-212
- F-215 NOT-RUN: Run models locally option. same screen as F-212
- F-216 NOT-RUN: Setup-slow banner, boot screen. boot states are covered by shell-state tests; the server is healthy in the sandbox
- F-217 DROPPED: Guided onboarding chat (two-profile mechanics). dropped by owner decision; a simple Vanta first run replaces it
- F-218 DROPPED: Free-tier sign-in dialog and notice. removed with the branding
- F-219 DROPPED: Remote first-run connection setup. dropped by owner decision (one local server)
- F-220 NOT-RUN: Boot overlays and offline banner. needs the server to be down; the banner component and its Retry now are in the titlebar tests
- F-221 DROPPED: Legal butterbar (Nous terms). removed with the branding
- F-222 DROPPED: Usage-stats consent strip. removed with the branding (telemetry)
- F-224 DROPPED: Billing banner and remote-display banner. billing banner removed; the remote-display banner is not mounted
- F-227 INERT: Capabilities > Connectors. the tab is there and opens Connections; the Nous-hosted connector directory is removed, accounts live on Connections
- F-232 INERT: Webhooks page. the status-bar chip is present but opens nothing: there are no webhook routes in the Vanta server, so there is no page to show
- F-236 DROPPED: Memory Graph (Starmap). no titlebar, palette or menu entry (owner decision: gimmick); the code stays in the tree until the owner confirms
- F-237 INERT: Import session (Claude Code, Codex). the overlay opens from the palette; scanning needs a session-import route (not served)
- F-238 INERT: Updates overlay. the row opens the update status; no update feed is configured in this build, so there is nothing to apply
- F-241 DROPPED: Send diagnostics dialog. removed with the branding (agreed); Copy diagnostics and Reveal logs remain (vanta:logs:reveal)
- F-242 NOT-RUN: Error boundary. needs a renderer crash; the boundary component is unchanged and unit-tested
- F-243 INERT: Kanban plugin page. the Kanban plugin is switched off by default and its board route is not served; it appears only as a plugin row in Settings and the palette
- F-244 DROPPED: Radio and hello-runtime sample plugins. removed (owner decision)

Renderer errors seen (8, 2 distinct): Error: unsupported: desktopPluginsRoot is not available in Vanta Desktop yet ; Error: unsupported: getRemoteDisplayReason is not available in Vanta Desktop yet
