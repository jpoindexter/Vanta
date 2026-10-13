# IPC surface of the Vanta shell (2026-10-13, DN-07; native capabilities restored in R2)

What `window.hermesDesktop`, `window.vantaDesktop` and the Electron main process expose after the facade, against the Hermes
surface it replaces. Source of truth for the code: `apps/desktop/electron/vanta/` (`channels.ts` lists every new channel).
Regenerate the stub inventory with `node scripts/generate-bridge-manifest.mjs` (then prettier).

## 1. Summary

| | Hermes shell | Vanta shell |
|---|---|---|
| `ipcMain` channels registered | 206 literal + 1 computed (`command-screenshot.ts`) across `electron/*.ts` | 120 channel names in `channels.ts`: 90 `vanta:*` and 30 `hermes:*` (pushes the renderer already listens for, plus three modules reused unchanged: notifications, machine profile, `hud-ipc.ts`). 37 old channels had a Vanta counterpart at DN-07; R2 adds the rest of table C |
| `window.hermesDesktop` members (leaves) | 268 | 268 present: 141 real (includes the 2 `vanta.*` members and the `hud.windowing` flags), 127 typed-unsupported or absent (`screenshot`, `hudModifier`, macOS-only, left undefined). R2 moved 88 members from stub to real |
| Main to renderer push channels | 72 | 23 kept (see D), the rest removed |
| Python backend boot, bootstrap installer, SSH, cloud, pool, relay | in `main.ts` (19,776 lines) | not loaded: the Vanta shell entry is `electron/vanta/entry.ts` |
| Updater (`electron-updater`, update hold, app installer) | wired | not loaded; `updates.*`, `updateHold.*`, `uninstall.*` are stubs |

`scripts/bundle-electron-main.mjs` now bundles the Vanta pair by default (`--shell vanta`). The imported Hermes `main.ts`, `preload.ts`
and about 290 sibling modules stay in the tree, unreferenced by the Vanta bundle, until DN-14 retires them; `--shell hermes` still
builds them and is what `bundle-electron-main.test.mjs` pins. Nothing from that code ships in a Vanta build.

Rules the facade follows:
- Same member names, so the renderer never calls `undefined()`. `contextBridge` cannot expose a Proxy, so every member is listed (generated manifest).
- A stub is honest: async members reject with `unsupported: <member> is not available in Vanta Desktop yet`. Nothing pretends to succeed.
- The boundary token never leaves main. The renderer gets the opaque placeholder `vanta-bridge` and an opaque `wsUrl` of `vanta://local`.
- Every renderer-supplied value is validated in main (zod, allowlists) before it touches the OS or the network.

## 2. Security notes: handlers that touch the filesystem, processes or the network

The renderer is treated as untrusted. The Hermes surface gave it file writes, a pty, git, plugin install, an updater and a generic
authenticated HTTP proxy. The Vanta shell removes those and keeps only the handlers below, each with a gate.

| Handler | What it can do | Gate | Residual risk |
|---|---|---|---|
| `vanta:request` (`api`, `vanta.request`) | HTTP to the one Vanta server | Path must normalise to `/api/...` (no `..`, no encoded separators, no other origin); method allowlist GET/POST/PUT/PATCH/DELETE, the last three sent as POST; `clientId` charset-checked; timeout capped at 30 min; token added in main, sent as a header (never in a URL) | The renderer can call any `/api` route. The boundary is the server's own approval and kernel gate, unchanged. |
| `vanta:events:open` | Server-sent events for one chat | Max 32 streams per window; closed when the window is destroyed | None beyond the above. |
| `vanta:openExternal` | Open a URL in the OS | Only `http:`, `https:`, `mailto:`, max 4 KB. `file:`, `javascript:`, custom schemes refused | A web page can be opened in the browser (by design). |
| `vanta:fs:openDir` | Open a folder in the file manager | Absolute path that exists and **is a directory**. `shell.openPath` runs files, so a file is refused | None known. |
| `vanta:fs:reveal` | Select an item in the file manager | Absolute existing path; uses `showItemInFolder` (select only, never open or run) | Reveals that a path exists. |
| `vanta:selectPaths`, `vanta:pick-attachments`, `vanta:project:pick-default` | Native open dialog | Dialog options allowlisted (`openFile`, `openDirectory`, `multiSelections`, `createDirectory`, title, button label, default path); returns only what the user picks | None. |
| `vanta:resolve-dropped-paths` | List file paths under renderer-supplied absolute paths | Reused `dropped-paths.mjs`: names only, **no file contents**, symlinks skipped, `.env*`, keys, `.ssh`, `.aws`, `.git`, `node_modules` skipped, 100 paths and 50 files max | A compromised renderer could enumerate file names under any directory it names. Restrict to user-granted paths when the composer is rebuilt (DN-03). |
| `vanta:workspace:sanitize` | `stat` a directory | Absolute existing directory else the project root | None. |
| `vanta:project:set-default`, `vanta:switch-project-for-new-task` | Restart the Vanta runtime in another folder, which becomes the agent's workspace | A folder the user picked in a native dialog this session is allowed; the current root is allowed; **any other folder needs a native confirmation dialog** the renderer cannot script; the folder must exist | The user can approve a folder. The agent still needs approval for every effect inside it. |
| `vanta:readClipboard`, `vanta:read-clipboard`, `vanta:writeClipboard` | Read or write the system clipboard | Text only (1M chars) for the Hermes pair; text plus one PNG for the Vanta paste | A compromised renderer can read what is on the clipboard. Needed for paste. |
| `hermes:notify` (reused module) | OS notification | Reused `notification-ipc.ts` unchanged (deduped, titles/bodies as text) | Defaults the title to "Hermes" until DN-11 rewrites brand strings. |
| `vanta:logs:*` | Append renderer text to `desktop.log`; reveal the file | Lines capped at 2,000 chars; log truncated at 1 MB; reveal selects the file only | Log injection of text (no secrets are read). |
| `vanta:window-control`, `native-theme`, `titlebar-theme`, `power-resume`, `window-state-changed` | Window chrome | Action allowlist; colours must be strings | None. |

Added in R2 (every row is covered by a unit test for the success path and the refusal path; section 5 explains the model):

| Handler | What it can do | Gate | Residual risk |
|---|---|---|---|
| `vanta:fs:read-dir`, `read-text`, `read-data-url`, `normalize-preview`, `git-root` | List folders, read text (512 KiB cap) or a data URL (16 MiB cap), describe a preview target, find a repo root | `project-guard.ts`: the realpath must be inside the active project root (`..`, absolute escapes and symlinks that point out are refused); `.env*`, keys, `.ssh`, `.aws`, `.gnupg`, `.git`, `.vanta`, `VANTA_HOME` and the app's userData are refused even through a symlink alias; secrets are left out of listings; non-image schemes (`javascript:`, `data:`) are not previewable | Anything not secret-shaped inside the project is readable by the renderer. A secret with an ordinary name is not detected |
| `vanta:fs:watch-directory`, `watch-file`, `stop-watch` | Debounced change ticks for a folder or one file | Same guard; 64 watches per window; one `destroyed` hook per window; all closed on project switch | None known |
| `vanta:git:*` reads (`repo-status`, `file-diff`, `branch-list`, `base-branch-list`, `worktree-list`, `scan-repos`, `review-list`, `review-diff`, `review-rev-parse`, `review-ship-info`, `review-pr-list`) | Run git to read state | `git-runner.ts`: argv is built in main from typed values and re-validated per subcommand (status, diff, log `-n`, rev-parse, branch `--list`, ls-files, merge-base, check-ignore, worktree `list`); no `-c`, `--output`, `--no-index`, external diff, textconv or pager; fixed cwd = the repo inside the project; env is `PATH`, `HOME=/nonexistent`, `GIT_CONFIG_GLOBAL=/dev/null`, no prompts; fsmonitor, hooks, pager and external diff are forced off; 15 s timeout, 4 MiB output cap, 1 MiB per diff; refs must match a plain-ref pattern; file arguments are repo-relative, never a secret path; untracked files are diffed in JS, not with git | A repo's own `.gitattributes` clean filters could still run on `status` if `.git/config` defines them; that needs a write to `.git/config`, which is already full compromise of that repo |
| `vanta:git:mutate` (stage, unstage, revert, commit, push, branchSwitch, worktreeAdd, worktreeRemove) | Change a repository | Main turns the typed request into exact shell commands (single-quoted arguments, named files instead of `add -A`, secrets excluded, `git -C` for a nested repo) and sends each one, in order, to `POST /api/terminal`: the kernel's decision, the approval card in the chat whose event stream the window opened last, and the OS sandbox. First failure stops the rest. No chat open means nothing runs | What the kernel allows without a card (for example `git add` inside the project) runs without one, exactly as it does for the agent |
| `vanta:git:mutation` | Answer for `git.review.createPr` | Always refuses with a readable message | None |
| `vanta:terminal:*` | A terminal pane | No pty. A line is one command sent to `POST /api/terminal` (same path as `git:mutate`). 8 panes per window, 20 queued lines, 4,000-character lines, 100,000-character writes, 200,000 characters of output; escape sequences (OSC 52, title, cursor) and control characters are stripped from output; a pane is usable only by the window that started it | `cd` and interactive programs are not available. Ctrl-C cannot stop a command already sent |
| `vanta:fs:rename`, `vanta:fs:trash` | Rename or move to the Trash | Project-only; the project folder, secret names and existing names are refused; a native dialog (not scriptable by the page) names the exact paths; one dialog at a time | The user can approve an unwise rename |
| `vanta:save-image` | Save an image | Accepts only `data:image/*` URLs and image files inside the project (nothing is fetched); the destination comes from the OS save dialog, never from the page; 50 MB cap | None known |
| `vanta:find-in-page`, `stop-find-in-page` | Search the page text | Query is a string up to 500 characters; options are schema-checked | None |
| `vanta:keep-awake`, `vanta:active-work`, `vanta:power-battery:get` | Hold the machine awake; mirror battery state | Mode is one of off, while-working, always; the work report is an integer 0 to 1000 | None |
| `vanta:zoom:persist` | Save the zoom level | A finite percent 1 to 10,000, clamped to the 50 to 300 percent range | None |
| `vanta:deep-link-ready` and `vanta://` links | Open a session, prefill a blueprint, report a finished connection | Only kinds `session`, `blueprint`, `connections` are honoured. Links that would install a plugin, skill or MCP server are dropped. Length, parameter count and control characters are bounded; links that arrive before the renderer listens are held (20 at most). The protocol is registered only in a packaged build | A web page can open Vanta at a session id or prefill a composer draft; it cannot send it |
| `vanta:quick-entry:*` | Global shortcut composer | Only the quick window may submit, only the main window may acknowledge or push state; text is trimmed, 1 to 20,000 characters, keys are strict; the text goes to the main window's own prompt pipeline | The default chord `CommandOrControl+Shift+Space` is taken from other apps while Vanta runs; a taken chord is reported, not hidden |
| `hermes:hud:*` (reused `hud-ipc.ts`), `vanta:minimize-to-tray:*` | Move and size the mini window; tray preference | Sender must be the mini window for move and resize; bounds are normalised; the tray setting is a boolean | None |
| `vanta:context-menu:*` | Copy, cut, paste, select all, copy image, spelling | Edit verbs are an allowlist of four; spelling words up to 100 characters; each acts on the window that asked | None |

Removed at DN-07 and still unsupported (every member rejects with `unsupported: <member> is not available in Vanta Desktop yet`):
renderer file writes (`writeTextFile`, `saveImageBuffer`, `saveGatewayFile`, `selectSavePath`, `savePastedText`, `saveClipboardImage`);
`readFileDataUrlForAttach` and `readPluginSource` (reads outside the project); `capturePreview`; `openSessionInTerminal`;
`installDesktopPlugin`, `removeDesktopPlugin`, `reconcileDesktopPlugins`, `probePluginRepo` (execute npm or git);
`updates.*`, `updateHold.*`, `uninstall.*`, `repairBootstrap`, `recycleBackend` (installers and the Python backend);
`sshConfigHosts`, `sshResolveHost`; `fetchLinkTitle`, `resolveFavicon`, `reachPreviewUrl` (renderer-chosen outbound requests);
`cloud.*`, `mcpOauth`, the OAuth connection config, `connections.*` writes; `desktopMetrics`, `themes` marketplace (telemetry and marketplace);
`git.review.commitContext` (needs a model call that does not exist); `dataUrlReadMax`; multi-window (`openWindow`, `openSessionWindow`,
`openBrowserWindow`, `windowRelay`); pool limits and the agent roster; pets and the wake indicator window; `hudModifier`, `screenshot`;
the HUD's cursor feed and game overlay. Dropped on purpose by the owner: pets, theme marketplace, radio and sample plugins, fleet topology,
the HUD game overlay.

Server-side PUT/PATCH/DELETE: `desktopBoundaryDecision` answers 405 to everything but GET and POST under `/api/`. The transport sends those methods
as POST. A Hermes REST path that Vanta has no POST route for answers 404 from the route table, which is the correct signal for DN-03 and later cards.

## 3. Tables

### A. Preload members (`window.hermesDesktop`)

### A1. Preload members kept (implemented)

| `window.hermesDesktop.` member | Old channel | New channel or implementation |
|---|---|---|
| `getConnection` | `hermes:connection` | vanta:connection |
| `getConnectionFor` | `hermes:connection:for` | vanta:connection |
| `revalidateConnection` | `hermes:connection:revalidate` | constant: ok, not rebuilt |
| `getGatewayWsUrl` | `hermes:gateway:ws-url` | constant opaque url `vanta://local` (no socket) |
| `getGatewayWsUrlFor` | `hermes:gateway:ws-url-for` | constant opaque url `vanta://local` |
| `windowControls.custom` | (local) | WSLg flag, computed in preload |
| `windowControls.minimize` | `hermes:window-control` | vanta:window-control |
| `windowControls.toggleMaximize` | `hermes:window-control` | vanta:window-control |
| `windowControls.close` | `hermes:window-control` | vanta:window-control |
| `getBootProgress` | `hermes:boot-progress:get` | vanta:boot-progress:get |
| `connections.list` | `hermes:connections:list` | one local connection |
| `profile.getDefault` | `hermes:profile:default:get` | null |
| `profile.get` | `hermes:profile:get` | profile null |
| `profile.remember` | `hermes:profile:remember` | profile null |
| `profile.set` | `hermes:profile:set` | profile null (no profiles) |
| `api` | `hermes:api` | vanta:request |
| `notify` | `hermes:notify` | hermes:notify (module reused) |
| `selectPaths` | `hermes:selectPaths` | vanta:selectPaths |
| `writeClipboard` | `hermes:writeClipboard` | vanta:writeClipboard |
| `readClipboard` | `hermes:readClipboard` | vanta:readClipboard |
| `getPathForFile` | (local) | `webUtils.getPathForFile` in preload (no IPC) |
| `setActiveWork` | `hermes:active-work` | vanta:active-work |
| `setTitleBarTheme` | `hermes:titlebar-theme` | vanta:titlebar-theme |
| `setNativeTheme` | `hermes:native-theme` | vanta:native-theme |
| `openExternal` | `hermes:openExternal` | vanta:openExternal |
| `sanitizeWorkspaceCwd` | `hermes:workspace:sanitize` | vanta:workspace:sanitize |
| `settings.getDefaultProjectDir` | `hermes:setting:defaultProjectDir:get` | vanta:project:get-default |
| `settings.setDefaultProjectDir` | `hermes:setting:defaultProjectDir:set` | vanta:project:set-default |
| `settings.pickDefaultProjectDir` | `hermes:setting:defaultProjectDir:pick` | vanta:project:pick-default |
| `zoom.get` | `hermes:zoom:get` | `webFrame`, in preload |
| `zoom.factor` | (local) | `webFrame`, in preload |
| `zoom.setPercent` | `hermes:zoom:set-percent` | `webFrame` in preload, then `vanta:zoom:persist` (saved in userData) |
| `zoom.onChanged` | `hermes:zoom:changed` | local listeners plus `hermes:zoom:changed` (push, from the View menu and restore) |
| `revealLogs` | `hermes:logs:reveal` | vanta:logs:reveal |
| `getRecentLogs` | `hermes:logs:recent` | vanta:logs:recent |
| `reportRendererError` | `hermes:logs:renderer-error` | vanta:logs:renderer-error |
| `logLine` | `hermes:logs:renderer-line` | vanta:logs:renderer-line |
| `revealPath` | `hermes:fs:reveal` | vanta:fs:reveal |
| `openDir` | `hermes:fs:openDir` | vanta:fs:openDir |
| `onWindowStateChanged` | `hermes:window-state-changed` | vanta:window-state-changed |
| `onFocusSession` | `hermes:focus-session` | hermes:focus-session (module reused) |
| `onNotificationAction` | `hermes:notification-action` | hermes:notification-action (module reused) |
| `onNotificationActivate` | `hermes:notification-activate` | hermes:notification-activate (module reused) |
| `onBackendExit` | `hermes:backend-exit` | vanta:backend-exit |
| `onPowerResume` | `hermes:power-resume` | vanta:power-resume |
| `onBootProgress` | `hermes:boot-progress` | vanta:boot-progress |
| `getBootstrapState` | `hermes:bootstrap:get` | constant: idle (no install flow) |
| `probeLocalBackend` | `hermes:local-backend:probe` | constant: bootstrapNeeded false |
| `continueBootstrapLocal` | `hermes:bootstrap:continue-local` | constant: ok |
| `getVersion` | `hermes:version` | vanta:version |
| `getMachineProfile` | `hermes:machine:profile` | hermes:machine:profile (module reused) |
| `readDir` | `hermes:fs:readDir` | vanta:fs:read-dir |
| `gitRoot` | `hermes:fs:gitRoot` | vanta:fs:git-root |
| `readFileText` | `hermes:readFileText` | vanta:fs:read-text |
| `readFileDataUrl` | `hermes:readFileDataUrl` | vanta:fs:read-data-url |
| `normalizePreviewTarget` | `hermes:normalizePreviewTarget` | vanta:fs:normalize-preview |
| `watchDirectory` | `hermes:watchDirectory` | vanta:fs:watch-directory |
| `watchPreviewFile` | `hermes:watchPreviewFile` | vanta:fs:watch-file |
| `stopPreviewFileWatch` | `hermes:stopPreviewFileWatch` | vanta:fs:stop-watch |
| `onPreviewFileChanged` | `hermes:preview-file-changed` | hermes:preview-file-changed (push) |
| `git.repoStatus` | `hermes:git:repoStatus` | vanta:git:repo-status |
| `git.fileDiff` | `hermes:git:fileDiff` | vanta:git:file-diff |
| `git.branchList` | `hermes:git:branchList` | vanta:git:branch-list |
| `git.baseBranchList` | `hermes:git:baseBranchList` | vanta:git:base-branch-list |
| `git.worktreeList` | `hermes:git:worktreeList` | vanta:git:worktree-list |
| `git.scanRepos` | `hermes:git:scanRepos` | vanta:git:scan-repos |
| `git.review.list` | `hermes:git:review:list` | vanta:git:review-list |
| `git.review.diff` | `hermes:git:review:diff` | vanta:git:review-diff |
| `git.review.revParse` | `hermes:git:review:revParse` | vanta:git:review-rev-parse |
| `git.review.shipInfo` | `hermes:git:review:shipInfo` | vanta:git:review-ship-info (always `ghReady: false`) |
| `git.review.prList` | `hermes:git:review:prList` | vanta:git:review-pr-list (always empty) |
| `git.review.stage` | `hermes:git:review:stage` | vanta:git:mutate (approval) |
| `git.review.unstage` | `hermes:git:review:unstage` | vanta:git:mutate (approval) |
| `git.review.revert` | `hermes:git:review:revert` | vanta:git:mutate (approval) |
| `git.review.commit` | `hermes:git:review:commit` | vanta:git:mutate (approval) |
| `git.review.push` | `hermes:git:review:push` | vanta:git:mutate (approval) |
| `git.branchSwitch` | `hermes:git:branchSwitch` | vanta:git:mutate (approval) |
| `git.worktreeAdd` | `hermes:git:worktreeAdd` | vanta:git:mutate (approval) |
| `git.worktreeRemove` | `hermes:git:worktreeRemove` | vanta:git:mutate (approval) |
| `git.review.createPr` | `hermes:git:review:createPr` | vanta:git:mutation (always refuses: needs `gh`) |
| `terminal.start` | `hermes:terminal:start` | vanta:terminal:start |
| `terminal.write` | `hermes:terminal:write` | vanta:terminal:write (each line is one approved command) |
| `terminal.resize` | `hermes:terminal:resize` | vanta:terminal:resize |
| `terminal.attach` | `hermes:terminal:attach` | vanta:terminal:attach |
| `terminal.cwd` | `hermes:terminal:cwd` | vanta:terminal:cwd |
| `terminal.dispose` | `hermes:terminal:dispose` | vanta:terminal:dispose |
| `terminal.onData` | (local value) | vanta:terminal:data (push) |
| `terminal.onExit` | (local value) | vanta:terminal:exit (push) |
| `findInPage` | `hermes:find-in-page` | vanta:find-in-page |
| `stopFindInPage` | `hermes:stop-find-in-page` | vanta:stop-find-in-page |
| `onFoundInPage` | `hermes:found-in-page` | hermes:found-in-page (push) |
| `onOpenFindBarRequested` | `hermes:open-find-bar` | hermes:open-find-bar (push) |
| `setKeepAwake` | `hermes:keep-awake` | vanta:keep-awake |
| `getOnBattery` | `hermes:power-battery:get` | vanta:power-battery:get |
| `onBatteryChanged` | `hermes:power-battery` | hermes:power-battery (push) |
| `onOpenFolderRequested` | `hermes:open-folder-requested` | hermes:open-folder-requested (push, from the File menu) |
| `onClosePreviewRequested` | `hermes:close-preview-requested` | hermes:close-preview-requested (push, from the File menu) |
| `onDeepLink` | `hermes:deep-link` | hermes:deep-link (push) |
| `signalDeepLinkReady` | `hermes:deep-link-ready` | vanta:deep-link-ready |
| `onExternalOpenFailed` | `hermes:external-open-failed` | hermes:external-open-failed (push) |
| `minimizeToTray.get` | `hermes:minimize-to-tray:get` | vanta:minimize-to-tray:get |
| `minimizeToTray.set` | `hermes:minimize-to-tray:set` | vanta:minimize-to-tray:set |
| `minimizeToTray.onChanged` | `hermes:minimize-to-tray:changed` | vanta:minimize-to-tray:changed (push) |
| `quickEntry.getSettings` | `hermes:quick-entry:settings:get` | vanta:quick-entry:settings:get |
| `quickEntry.setSettings` | `hermes:quick-entry:settings:set` | vanta:quick-entry:settings:set |
| `quickEntry.submit` | `hermes:quick-entry:submit` | vanta:quick-entry:submit |
| `quickEntry.ackSubmit` | `hermes:quick-entry:ack` | vanta:quick-entry:ack |
| `quickEntry.dismiss` | `hermes:quick-entry:dismiss` | vanta:quick-entry:dismiss |
| `quickEntry.pushState` | `hermes:quick-entry:state` | vanta:quick-entry:state |
| `quickEntry.onState` | `hermes:quick-entry:state` | vanta:quick-entry:state (push) |
| `quickEntry.onSubmit` | `hermes:quick-entry:submit` | vanta:quick-entry:to-main (push) |
| `quickEntry.onShown` | `hermes:quick-entry:shown` | vanta:quick-entry:shown (push) |
| `quickEntry.onLateResult` | `hermes:quick-entry:late-result` | vanta:quick-entry:late-result (push) |
| `hud.open` | `hermes:hud:open` | hermes:hud:open (reused hud-ipc.ts) |
| `hud.close` | `hermes:hud:close` | hermes:hud:close (reused hud-ipc.ts) |
| `hud.setIgnoreMouse` | `hermes:hud:ignore-mouse` | hermes:hud:ignore-mouse |
| `hud.beginMove` | `hermes:hud:begin-move` | hermes:hud:begin-move |
| `hud.endMove` | `hermes:hud:end-move` | hermes:hud:end-move |
| `hud.moveBy` | `hermes:hud:move-by` | hermes:hud:move-by |
| `hud.setWorkspaceTransfer` | `hermes:hud:workspace-transfer` | hermes:hud:workspace-transfer |
| `hud.setBounds` | `hermes:hud:set-bounds` | hermes:hud:set-bounds |
| `hud.resetLayout` | `hermes:hud:reset-layout` | hermes:hud:reset-layout |
| `hud.setFrost` | `hermes:hud:frost` | hermes:hud:frost |
| `hud.setSession` | `hermes:hud:session` | hermes:hud:session |
| `hud.onGoto` | `hermes:hud:goto` | hermes:hud:goto (push) |
| `hud.onChanged` | `hermes:hud:changed` | hermes:hud:changed (push) |
| `hud.nativeDrag` | (local value) | value from `hermes:hud:windowing` (sync, at preload) |
| `hud.windowing.clientPlacement` | (local value) | value from `hermes:hud:windowing` |
| `hud.windowing.controlDrag` | (local value) | value from `hermes:hud:windowing` |
| `hud.windowing.nativeDrag` | (local value) | value from `hermes:hud:windowing` |
| `hud.windowing.solid` | (local value) | value from `hermes:hud:windowing` |
| `hud.windowing.workspaceTransfer` | (local value) | value from `hermes:hud:windowing` |
| `contextMenuEdit` | `hermes:context-menu:edit` | vanta:context-menu:edit |
| `contextMenuCopyImage` | `hermes:context-menu:copy-image` | vanta:context-menu:copy-image |
| `contextMenuSpellcheck` | `hermes:context-menu:spellcheck` | vanta:context-menu:spellcheck |
| `onContextMenuSpellcheck` | `hermes:context-menu-spellcheck` | hermes:context-menu-spellcheck (push) |
| `renamePath` | `hermes:fs:rename` | vanta:fs:rename (native confirm) |
| `trashPath` | `hermes:fs:trash` | vanta:fs:trash (native confirm) |
| `saveImageFromUrl` | `hermes:saveImageFromUrl` | vanta:save-image (OS save dialog) |

### A2. Preload members stubbed (typed unsupported)

Async members reject with `unsupported: <member> is not available in Vanta Desktop yet`; `on*` subscriptions return a no-op unsubscribe; fire-and-forget members do nothing; flags are `false`, facts are `null`. The old channel is no longer registered by any main process, so there is nothing behind these.

| Member | Old channel | Stub | Capability removed (if risky) |
|---|---|---|---|
| `glassSupported` | (local value) | typed unsupported |  |
| `translucencySupported` | (local value) | typed unsupported |  |
| `localModelsEnabled` | (local value) | typed unsupported |  |
| `guestOnboardingEnabled` | (local value) | typed unsupported |  |
| `localSkin` | (local value) | typed unsupported |  |
| `getEmbedHostOrigin` | `hermes:embed-host:origin` | typed unsupported |  |
| `getProfileRoutes` | `hermes:plugin-profile-routes` | typed unsupported |  |
| `touchBackend` | `hermes:backend:touch` | typed unsupported |  |
| `getPoolLimits` | `hermes:pool-limits:get` | typed unsupported |  |
| `setPoolLimits` | `hermes:pool-limits:set` | typed unsupported |  |
| `getAgentRoster` | `hermes:agents:roster` | typed unsupported |  |
| `openSessionWindow` | `hermes:window:openSession` | typed unsupported | exec/process |
| `openSessionInTerminal` | `hermes:window:openInTerminal` | typed unsupported | exec/process |
| `openWindow` | `hermes:window:openInstance` | typed unsupported | exec/process |
| `openBrowserWindow` | `hermes:window:openBrowser` | typed unsupported | exec/process |
| `windowRelay.send` | `hermes:window:relay` | typed unsupported |  |
| `windowRelay.onMessage` | `hermes:window:relay` | typed unsupported |  |
| `onBrowserPopoutClosed` | `hermes:browser-popout:closed` | typed unsupported |  |
| `claimAmbientCue` | `hermes:ambient:claim` | typed unsupported |  |
| `wakeIndicator.getState` | `hermes:wake-indicator:get` | typed unsupported |  |
| `wakeIndicator.setState` | `hermes:wake-indicator:set` | typed unsupported |  |
| `wakeIndicator.onState` | `hermes:wake-indicator:state` | typed unsupported |  |
| `chatOnboarding.size` | `hermes:window:size` | typed unsupported |  |
| `petOverlay.open` | `hermes:pet-overlay:open` | typed unsupported |  |
| `petOverlay.close` | `hermes:pet-overlay:close` | typed unsupported |  |
| `petOverlay.setBounds` | `hermes:pet-overlay:set-bounds` | typed unsupported |  |
| `petOverlay.setIgnoreMouse` | `hermes:pet-overlay:ignore-mouse` | typed unsupported |  |
| `petOverlay.setFocusable` | `hermes:pet-overlay:set-focusable` | typed unsupported |  |
| `petOverlay.pushState` | `hermes:pet-overlay:state` | typed unsupported |  |
| `petOverlay.control` | `hermes:pet-overlay:control` | typed unsupported |  |
| `petOverlay.onState` | `hermes:pet-overlay:state` | typed unsupported |  |
| `petOverlay.onControl` | `hermes:pet-overlay:control` | typed unsupported |  |
| `hud.onCursor` | `hermes:hud:cursor` | typed unsupported |  |
| `hud.onGameOverlay` | `hermes:hud:game-overlay` | typed unsupported |  |
| `hudModifier` | `hermes:hud-modifier:settings:get`, `hermes:hud-modifier:settings:set`, `hermes:hud-modifier:permission`, `hermes:hud-modifier:status` | typed unsupported |  |
| `screenshot` | `hermes:screenshot:settings:get`, `hermes:screenshot:settings:set`, `hermes:screenshot:permission`, `hermes:screenshot:capture`, `hermes:screenshot:status`, `hermes:screenshot:subscribe` | typed unsupported |  |
| `getConnectionConfig` | `hermes:connection-config:get` | typed unsupported | network/credentials |
| `saveConnectionConfig` | `hermes:connection-config:save` | typed unsupported | network/credentials |
| `applyConnectionConfig` | `hermes:connection-config:apply` | typed unsupported | network/credentials |
| `testConnectionConfig` | `hermes:connection-config:test` | typed unsupported | network/credentials |
| `getSecretStorageEncryption` | `hermes:secret-storage:get` | typed unsupported |  |
| `setSecretStorageEncryption` | `hermes:secret-storage:set` | typed unsupported |  |
| `connections.save` | `hermes:connections:save` | typed unsupported | network/credentials |
| `connections.remove` | `hermes:connections:remove` | typed unsupported | network/credentials |
| `connections.setPrimary` | `hermes:connections:set-primary` | typed unsupported |  |
| `connections.setLaunchMode` | `hermes:connections:set-launch-mode` | typed unsupported |  |
| `connections.setLastUsed` | `hermes:connections:set-last-used` | typed unsupported |  |
| `connections.test` | `hermes:connections:test` | typed unsupported | network/credentials |
| `connections.updateManaged` | `hermes:connections:update-managed` | typed unsupported | network/credentials |
| `connections.updateAll` | `hermes:connections:update-all` | typed unsupported | network/credentials |
| `connections.onChanged` | `hermes:connections:changed` | typed unsupported |  |
| `sshConfigHosts` | `hermes:ssh-config:hosts` | typed unsupported | exec/process |
| `sshResolveHost` | `hermes:ssh-config:resolve` | typed unsupported | exec/process |
| `probeConnectionConfig` | `hermes:connection-config:probe` | typed unsupported | network/credentials |
| `oauthLoginConnectionConfig` | `hermes:connection-config:oauth-login` | typed unsupported | network/credentials |
| `oauthLogoutConnectionConfig` | `hermes:connection-config:oauth-logout` | typed unsupported | network/credentials |
| `cloud.status` | `hermes:cloud:status` | typed unsupported | network/credentials |
| `cloud.login` | `hermes:cloud:login` | typed unsupported | network/credentials |
| `cloud.logout` | `hermes:cloud:logout` | typed unsupported | network/credentials |
| `cloud.discover` | `hermes:cloud:discover` | typed unsupported | network/credentials |
| `cloud.agentSignIn` | `hermes:cloud:agent-sign-in` | typed unsupported | network/credentials |
| `profile.setDefault` | `hermes:profile:default:set` | typed unsupported |  |
| `profile.onDefaultChanged` | `hermes:profile:default:changed` | typed unsupported |  |
| `claimStartupLatency` | `hermes:startup-latency:claim` | typed unsupported |  |
| `requestMicrophoneAccess` | `hermes:requestMicrophoneAccess` | typed unsupported |  |
| `readWindowBelow` | `hermes:window:readBelow` | typed unsupported |  |
| `readFileDataUrlForAttach` | `hermes:readFileDataUrlForAttach` | typed unsupported | fs-read |
| `dataUrlReadMax.get` | `hermes:data-url-read-max:get` | typed unsupported | fs-read |
| `dataUrlReadMax.set` | `hermes:data-url-read-max:set` | typed unsupported | fs-read |
| `readPluginSource` | `hermes:readPluginSource` | typed unsupported | fs-read |
| `selectSavePath` | `hermes:selectSavePath` | typed unsupported | fs-write |
| `saveGatewayFile` | `hermes:saveGatewayFile` | typed unsupported | fs-write |
| `contextMenuGuestAddWord` | `hermes:context-menu:guest-add-word` | typed unsupported |  |
| `saveImageBuffer` | `hermes:saveImageBuffer` | typed unsupported | fs-write |
| `capturePreview` | `hermes:capturePreview` | typed unsupported | fs-read |
| `savePastedText` | `hermes:savePastedText` | typed unsupported | fs-write |
| `saveClipboardImage` | `hermes:saveClipboardImage` | typed unsupported | fs-write |
| `setTranslucency` | `hermes:translucency` | typed unsupported |  |
| `setDisableF12` | `hermes:devtools:disable-f12` | typed unsupported |  |
| `setF12ShortcutActive` | `hermes:f12ShortcutActive` | typed unsupported |  |
| `onF12Shortcut` | `hermes:f12-shortcut` | typed unsupported |  |
| `setPreviewShortcutActive` | `hermes:previewShortcutActive` | typed unsupported |  |
| `setPreviewGuestHidden` | `hermes:preview-guest-hidden` | typed unsupported |  |
| `freeTierChallenge.run` | `hermes:freeTierChallenge:run` | typed unsupported | network/credentials |
| `mcpOauth.listen` | `hermes:mcp-oauth:listen` | typed unsupported | network/credentials |
| `mcpOauth.wait` | `hermes:mcp-oauth:wait` | typed unsupported | network/credentials |
| `mcpOauth.cancel` | `hermes:mcp-oauth:cancel` | typed unsupported | network/credentials |
| `openPreviewInBrowser` | `hermes:openPreviewInBrowser` | typed unsupported |  |
| `reachPreviewUrl` | `hermes:preview:reach` | typed unsupported | network/credentials |
| `setActiveConnectionRoute` | `hermes:connection:active-route` | typed unsupported |  |
| `fetchLinkTitle` | `hermes:fetchLinkTitle` | typed unsupported | network/credentials |
| `resolveFavicon` | `hermes:resolveFavicon` | typed unsupported | network/credentials |
| `desktopPluginsRoot` | `hermes:fs:desktopPluginsRoot` | typed unsupported | fs-read |
| `reconcileDesktopPlugins` | `hermes:fs:reconcileDesktopPlugins` | typed unsupported | exec/process |
| `logsRoot` | `hermes:fs:logsRoot` | typed unsupported | fs-read |
| `writeTextFile` | `hermes:fs:writeText` | typed unsupported | fs-write |
| `git.review.commitContext` | `hermes:git:review:commitContext` | typed unsupported | exec/process |
| `onPreviewNav` | `hermes:preview-nav` | typed unsupported |  |
| `onOpenUpdatesRequested` | `hermes:open-updates` | typed unsupported |  |
| `probePluginRepo` | `hermes:plugin:probe` | typed unsupported | network/credentials |
| `installDesktopPlugin` | `hermes:plugin:installDesktop` | typed unsupported | exec/process |
| `removeDesktopPlugin` | `hermes:plugin:removeDesktop` | typed unsupported | exec/process |
| `onPoolBackendRetiring` | `hermes:pool:retiring` | typed unsupported |  |
| `onConnectionApplied` | `hermes:connection:applied` | typed unsupported |  |
| `recycleBackend` | `hermes:backend:recycle` | typed unsupported | exec/process |
| `resetBootstrap` | `hermes:bootstrap:reset` | typed unsupported | exec/process |
| `updateHold.recheck` | `hermes:update-hold:recheck` | typed unsupported | exec/process |
| `updateHold.quit` | `hermes:update-hold:quit` | typed unsupported | exec/process |
| `updateHold.startAnyway` | `hermes:update-hold:start-anyway` | typed unsupported | exec/process |
| `repairBootstrap` | `hermes:bootstrap:repair` | typed unsupported | exec/process |
| `cancelBootstrap` | `hermes:bootstrap:cancel` | typed unsupported | exec/process |
| `onBootstrapEvent` | `hermes:bootstrap:event` | typed unsupported |  |
| `relaunchApp` | `hermes:app:relaunch` | typed unsupported | exec/process |
| `getRemoteDisplayReason` | `hermes:get-remote-display-reason` | typed unsupported |  |
| `uninstall.summary` | `hermes:uninstall:summary` | typed unsupported | exec/process |
| `uninstall.run` | `hermes:uninstall:run` | typed unsupported | exec/process |
| `uninstall.openAppsSettings` | `hermes:uninstall:openAppsSettings` | typed unsupported | exec/process |
| `updates.check` | `hermes:updates:check` | typed unsupported | exec/process |
| `updates.apply` | `hermes:updates:apply` | typed unsupported | exec/process |
| `updates.setChannel` | `hermes:updates:channel:set` | typed unsupported | exec/process |
| `updates.onProgress` | `hermes:updates:progress` | typed unsupported | exec/process |
| `updates.takePendingRun` | `hermes:updates:metric:take` | typed unsupported | exec/process |
| `updates.ackPendingRun` | `hermes:updates:metric:ack` | typed unsupported | exec/process |
| `updates.onPendingRun` | `hermes:updates:metric:pending` | typed unsupported | exec/process |
| `desktopMetrics.setEnabled` | `hermes:desktop-metrics:set-enabled` | typed unsupported | network/credentials |
| `desktopMetrics.takeRendererCrashes` | `hermes:desktop-metrics:crash:take` | typed unsupported | network/credentials |
| `desktopMetrics.ackRendererCrashes` | `hermes:desktop-metrics:crash:ack` | typed unsupported | network/credentials |
| `themes.fetchMarketplace` | `hermes:vscode-theme:fetch` | typed unsupported | network/credentials |
| `themes.searchMarketplace` | `hermes:vscode-theme:search` | typed unsupported | network/credentials |

### B. Old `ipcMain` channels (Hermes `electron/*.ts`)

Every one of these is **gone from the Vanta bundle**. "replaced" means a Vanta handler now provides the same member under the channel shown.
`removed (member stubbed)` means the renderer member still exists and rejects as unsupported.

| Old `ipcMain` channel | Registered in | Preload member(s) | Disposition |
|---|---|---|---|
| `hermes:active-work` | `main.ts` | `setActiveWork` | replaced: local |
| `hermes:agents:roster` | `main.ts` | `getAgentRoster` | removed (member stubbed) |
| `hermes:ambient:claim` | `main.ts` | `claimAmbientCue` | removed (member stubbed) |
| `hermes:api` | `main.ts` | `api` | replaced: vanta:request |
| `hermes:app:relaunch` | `main.ts` | `relaunchApp` | removed (member stubbed) |
| `hermes:backend:recycle` | `main.ts` | `recycleBackend` | removed (member stubbed) |
| `hermes:backend:touch` | `main.ts` | `touchBackend` | removed (member stubbed) |
| `hermes:bootstrap:cancel` | `main.ts` | `cancelBootstrap` | removed (member stubbed) |
| `hermes:bootstrap:continue-local` | `main.ts` | `continueBootstrapLocal` | replaced: local |
| `hermes:bootstrap:get` | `main.ts` | `getBootstrapState` | replaced: local |
| `hermes:bootstrap:repair` | `main.ts` | `repairBootstrap` | removed (member stubbed) |
| `hermes:bootstrap:reset` | `main.ts` | `resetBootstrap` | removed (member stubbed) |
| `hermes:capturePreview` | `main.ts` | `capturePreview` | removed (member stubbed) |
| `hermes:cloud:agent-sign-in` | `main.ts` | `cloud.agentSignIn` | removed (member stubbed) |
| `hermes:cloud:discover` | `main.ts` | `cloud.discover` | removed (member stubbed) |
| `hermes:cloud:login` | `main.ts` | `cloud.login` | removed (member stubbed) |
| `hermes:cloud:logout` | `main.ts` | `cloud.logout` | removed (member stubbed) |
| `hermes:cloud:status` | `main.ts` | `cloud.status` | removed (member stubbed) |
| `hermes:connection` | `main.ts` | `getConnection` | replaced: vanta:connection |
| `hermes:connection-config:apply` | `main.ts` | `applyConnectionConfig` | removed (member stubbed) |
| `hermes:connection-config:get` | `main.ts` | `getConnectionConfig` | removed (member stubbed) |
| `hermes:connection-config:oauth-login` | `main.ts` | `oauthLoginConnectionConfig` | removed (member stubbed) |
| `hermes:connection-config:oauth-logout` | `main.ts` | `oauthLogoutConnectionConfig` | removed (member stubbed) |
| `hermes:connection-config:probe` | `main.ts` | `probeConnectionConfig` | removed (member stubbed) |
| `hermes:connection-config:save` | `main.ts` | `saveConnectionConfig` | removed (member stubbed) |
| `hermes:connection-config:test` | `main.ts` | `testConnectionConfig` | removed (member stubbed) |
| `hermes:connection:active-route` | `main.ts` | `setActiveConnectionRoute` | removed (member stubbed) |
| `hermes:connection:for` | `main.ts` | `getConnectionFor` | replaced: vanta:connection |
| `hermes:connection:revalidate` | `main.ts` | `revalidateConnection` | replaced: local |
| `hermes:connections:list` | `main.ts` | `connections.list` | replaced: local |
| `hermes:connections:remove` | `main.ts` | `connections.remove` | removed (member stubbed) |
| `hermes:connections:save` | `main.ts` | `connections.save` | removed (member stubbed) |
| `hermes:connections:set-last-used` | `main.ts` | `connections.setLastUsed` | removed (member stubbed) |
| `hermes:connections:set-launch-mode` | `main.ts` | `connections.setLaunchMode` | removed (member stubbed) |
| `hermes:connections:set-primary` | `main.ts` | `connections.setPrimary` | removed (member stubbed) |
| `hermes:connections:test` | `main.ts` | `connections.test` | removed (member stubbed) |
| `hermes:connections:update-all` | `main.ts` | `connections.updateAll` | removed (member stubbed) |
| `hermes:connections:update-managed` | `main.ts` | `connections.updateManaged` | removed (member stubbed) |
| `hermes:context-menu:copy-image` | `main.ts` | `contextMenuCopyImage` | replaced: vanta:context-menu:copy-image |
| `hermes:context-menu:edit` | `main.ts` | `contextMenuEdit` | replaced: vanta:context-menu:edit |
| `hermes:context-menu:guest-add-word` | `main.ts` | `contextMenuGuestAddWord` | removed (member stubbed) |
| `hermes:context-menu:spellcheck` | `main.ts` | `contextMenuSpellcheck` | replaced: vanta:context-menu:spellcheck |
| `hermes:data-url-read-max:get` | `main.ts` | `dataUrlReadMax.get` | removed (member stubbed) |
| `hermes:data-url-read-max:set` | `main.ts` | `dataUrlReadMax.set` | removed (member stubbed) |
| `hermes:deep-link-ready` | `main.ts` | `signalDeepLinkReady` | replaced: vanta:deep-link-ready |
| `hermes:devtools:disable-f12` | `main.ts` | `setDisableF12` | removed (member stubbed) |
| `hermes:embed-host:origin` | `main.ts` | `getEmbedHostOrigin` | removed (member stubbed) |
| `hermes:f12ShortcutActive` | `main.ts` | `setF12ShortcutActive` | removed (member stubbed) |
| `hermes:feature-flags` | `main.ts` | (none) | removed (main-internal, no renderer member) |
| `hermes:fetchLinkTitle` | `main.ts` | `fetchLinkTitle` | removed (member stubbed) |
| `hermes:find-in-page` | `main.ts` | `findInPage` | replaced: vanta:find-in-page |
| `hermes:freeTierChallenge:run` | `challenge-window-ipc.ts` | `freeTierChallenge.run` | removed (member stubbed) |
| `hermes:fs:desktopPluginsRoot` | `fs-ipc.ts` | `desktopPluginsRoot` | removed (member stubbed) |
| `hermes:fs:gitRoot` | `fs-ipc.ts` | `gitRoot` | replaced: vanta:fs:git-root |
| `hermes:fs:logsRoot` | `fs-ipc.ts` | `logsRoot` | removed (member stubbed) |
| `hermes:fs:openDir` | `fs-ipc.ts` | `openDir` | replaced: vanta:fs:openDir |
| `hermes:fs:readDir` | `fs-ipc.ts` | `readDir` | replaced: vanta:fs:read-dir |
| `hermes:fs:reconcileDesktopPlugins` | `fs-ipc.ts` | `reconcileDesktopPlugins` | removed (member stubbed) |
| `hermes:fs:rename` | `fs-ipc.ts` | `renamePath` | replaced: vanta:fs:rename (native confirm) |
| `hermes:fs:reveal` | `fs-ipc.ts` | `revealPath` | replaced: vanta:fs:reveal |
| `hermes:fs:trash` | `fs-ipc.ts` | `trashPath` | replaced: vanta:fs:trash (native confirm) |
| `hermes:fs:writeText` | `fs-ipc.ts` | `writeTextFile` | removed (member stubbed) |
| `hermes:gateway:ws-url` | `main.ts` | `getGatewayWsUrl` | replaced: local |
| `hermes:gateway:ws-url-for` | `main.ts` | `getGatewayWsUrlFor` | replaced: local |
| `hermes:get-remote-display-reason` | `main.ts` | `getRemoteDisplayReason` | removed (member stubbed) |
| `hermes:git:baseBranchList` | `git-ipc.ts` | `git.baseBranchList` | replaced: vanta:git:base-branch-list |
| `hermes:git:branchList` | `git-ipc.ts` | `git.branchList` | replaced: vanta:git:branch-list |
| `hermes:git:branchSwitch` | `git-ipc.ts` | `git.branchSwitch` | replaced: vanta:git:mutate (approval) |
| `hermes:git:fileDiff` | `git-ipc.ts` | `git.fileDiff` | replaced: vanta:git:file-diff |
| `hermes:git:repoStatus` | `git-ipc.ts` | `git.repoStatus` | replaced: vanta:git:repo-status |
| `hermes:git:review:commit` | `git-ipc.ts` | `git.review.commit` | replaced: vanta:git:mutate (approval) |
| `hermes:git:review:commitContext` | `git-ipc.ts` | `git.review.commitContext` | removed (member stubbed) |
| `hermes:git:review:createPr` | `git-ipc.ts` | `git.review.createPr` | replaced: vanta:git:mutation (always refuses: needs `gh`) |
| `hermes:git:review:diff` | `git-ipc.ts` | `git.review.diff` | replaced: vanta:git:review-diff |
| `hermes:git:review:list` | `git-ipc.ts` | `git.review.list` | replaced: vanta:git:review-list |
| `hermes:git:review:prList` | `git-ipc.ts` | `git.review.prList` | replaced: vanta:git:review-pr-list (always empty) |
| `hermes:git:review:push` | `git-ipc.ts` | `git.review.push` | replaced: vanta:git:mutate (approval) |
| `hermes:git:review:revParse` | `git-ipc.ts` | `git.review.revParse` | replaced: vanta:git:review-rev-parse |
| `hermes:git:review:revert` | `git-ipc.ts` | `git.review.revert` | replaced: vanta:git:mutate (approval) |
| `hermes:git:review:shipInfo` | `git-ipc.ts` | `git.review.shipInfo` | replaced: vanta:git:review-ship-info (always `ghReady: false`) |
| `hermes:git:review:stage` | `git-ipc.ts` | `git.review.stage` | replaced: vanta:git:mutate (approval) |
| `hermes:git:review:unstage` | `git-ipc.ts` | `git.review.unstage` | replaced: vanta:git:mutate (approval) |
| `hermes:git:scanRepos` | `git-ipc.ts` | `git.scanRepos` | replaced: vanta:git:scan-repos |
| `hermes:git:worktreeAdd` | `git-ipc.ts` | `git.worktreeAdd` | replaced: vanta:git:mutate (approval) |
| `hermes:git:worktreeList` | `git-ipc.ts` | `git.worktreeList` | replaced: vanta:git:worktree-list |
| `hermes:git:worktreeRemove` | `git-ipc.ts` | `git.worktreeRemove` | replaced: vanta:git:mutate (approval) |
| `hermes:hud-modifier:${name}` | `hud-modifier.ts` | (none) | removed (main-internal, no renderer member) |
| `hermes:hud:begin-move` | `hud-ipc.ts` | `hud.beginMove` | replaced: hermes:hud:begin-move |
| `hermes:hud:close` | `hud-ipc.ts` | `hud.close` | replaced: hermes:hud:close (reused hud-ipc.ts) |
| `hermes:hud:end-move` | `hud-ipc.ts` | `hud.endMove` | replaced: hermes:hud:end-move |
| `hermes:hud:frost` | `hud-ipc.ts` | `hud.setFrost` | replaced: hermes:hud:frost |
| `hermes:hud:ignore-mouse` | `hud-ipc.ts` | `hud.setIgnoreMouse` | replaced: hermes:hud:ignore-mouse |
| `hermes:hud:move-by` | `hud-ipc.ts` | `hud.moveBy` | replaced: hermes:hud:move-by |
| `hermes:hud:native-drag` | `hud-ipc.ts` | (none) | removed (main-internal, no renderer member) |
| `hermes:hud:open` | `hud-ipc.ts` | `hud.open` | replaced: hermes:hud:open (reused hud-ipc.ts) |
| `hermes:hud:reset-layout` | `hud-ipc.ts` | `hud.resetLayout` | replaced: hermes:hud:reset-layout |
| `hermes:hud:session` | `hud-ipc.ts` | `hud.setSession` | replaced: hermes:hud:session |
| `hermes:hud:set-bounds` | `hud-ipc.ts` | `hud.setBounds` | replaced: hermes:hud:set-bounds |
| `hermes:hud:windowing` | `hud-ipc.ts` | (none) | removed (main-internal, no renderer member) |
| `hermes:hud:workspace-transfer` | `hud-ipc.ts` | `hud.setWorkspaceTransfer` | replaced: hermes:hud:workspace-transfer |
| `hermes:keep-awake` | `main.ts` | `setKeepAwake` | replaced: vanta:keep-awake |
| `hermes:local-backend:probe` | `main.ts` | `probeLocalBackend` | replaced: local |
| `hermes:logs:recent` | `main.ts` | `getRecentLogs` | replaced: vanta:logs:recent |
| `hermes:logs:renderer-error` | `main.ts` | `reportRendererError` | replaced: vanta:logs:renderer-error |
| `hermes:logs:renderer-line` | `main.ts` | `logLine` | replaced: vanta:logs:renderer-line |
| `hermes:logs:reveal` | `main.ts` | `revealLogs` | replaced: vanta:logs:reveal |
| `hermes:machine:profile` | `machine-profile.ts` | `getMachineProfile` | replaced: hermes:machine:profile (module reused) |
| `hermes:mcp-oauth:cancel` | `mcp-oauth-callback-ipc.ts` | `mcpOauth.cancel` | removed (member stubbed) |
| `hermes:mcp-oauth:listen` | `mcp-oauth-callback-ipc.ts` | `mcpOauth.listen` | removed (member stubbed) |
| `hermes:mcp-oauth:wait` | `mcp-oauth-callback-ipc.ts` | `mcpOauth.wait` | removed (member stubbed) |
| `hermes:minimize-to-tray:get` | `minimize-to-tray.ts` | `minimizeToTray.get` | replaced: vanta:minimize-to-tray:get |
| `hermes:minimize-to-tray:set` | `minimize-to-tray.ts` | `minimizeToTray.set` | replaced: vanta:minimize-to-tray:set |
| `hermes:native-theme` | `main.ts` | `setNativeTheme` | replaced: vanta:native-theme |
| `hermes:normalizePreviewTarget` | `main.ts` | `normalizePreviewTarget` | replaced: vanta:fs:normalize-preview |
| `hermes:notify` | `notification-ipc.ts` | `notify` | replaced: hermes:notify (module reused) |
| `hermes:openExternal` | `main.ts` | `openExternal` | replaced: vanta:openExternal |
| `hermes:openPreviewInBrowser` | `main.ts` | `openPreviewInBrowser` | removed (member stubbed) |
| `hermes:pet-overlay:close` | `pet-overlay-ipc.ts` | `petOverlay.close` | removed (member stubbed) |
| `hermes:pet-overlay:control` | `pet-overlay-ipc.ts` | `petOverlay.control`, `petOverlay.onControl` | removed (member stubbed) |
| `hermes:pet-overlay:ignore-mouse` | `pet-overlay-ipc.ts` | `petOverlay.setIgnoreMouse` | removed (member stubbed) |
| `hermes:pet-overlay:open` | `pet-overlay-ipc.ts` | `petOverlay.open` | removed (member stubbed) |
| `hermes:pet-overlay:set-bounds` | `pet-overlay-ipc.ts` | `petOverlay.setBounds` | removed (member stubbed) |
| `hermes:pet-overlay:set-focusable` | `pet-overlay-ipc.ts` | `petOverlay.setFocusable` | removed (member stubbed) |
| `hermes:pet-overlay:state` | `pet-overlay-ipc.ts` | `petOverlay.pushState`, `petOverlay.onState` | removed (member stubbed) |
| `hermes:plugin-profile-routes` | `main.ts` | `getProfileRoutes` | removed (member stubbed) |
| `hermes:plugin:installDesktop` | `fs-ipc.ts` | `installDesktopPlugin` | removed (member stubbed) |
| `hermes:plugin:probe` | `fs-ipc.ts` | `probePluginRepo` | removed (member stubbed) |
| `hermes:plugin:removeDesktop` | `fs-ipc.ts` | `removeDesktopPlugin` | removed (member stubbed) |
| `hermes:pool-limits:get` | `main.ts` | `getPoolLimits` | removed (member stubbed) |
| `hermes:pool-limits:set` | `main.ts` | `setPoolLimits` | removed (member stubbed) |
| `hermes:power-battery:get` | `main.ts` | `getOnBattery` | replaced: vanta:power-battery:get |
| `hermes:preview-guest-hidden` | `main.ts` | `setPreviewGuestHidden` | removed (member stubbed) |
| `hermes:preview:reach` | `main.ts` | `reachPreviewUrl` | removed (member stubbed) |
| `hermes:previewShortcutActive` | `main.ts` | `setPreviewShortcutActive` | removed (member stubbed) |
| `hermes:profile:default:get` | `main.ts` | `profile.getDefault` | replaced: local |
| `hermes:profile:default:set` | `main.ts` | `profile.setDefault` | removed (member stubbed) |
| `hermes:profile:get` | `main.ts` | `profile.get` | replaced: local |
| `hermes:profile:remember` | `main.ts` | `profile.remember` | replaced: local |
| `hermes:profile:set` | `main.ts` | `profile.set` | replaced: local |
| `hermes:quick-entry:ack` | `main.ts` | `quickEntry.ackSubmit` | replaced: vanta:quick-entry:ack |
| `hermes:quick-entry:dismiss` | `main.ts` | `quickEntry.dismiss` | replaced: vanta:quick-entry:dismiss |
| `hermes:quick-entry:settings:get` | `main.ts` | `quickEntry.getSettings` | replaced: vanta:quick-entry:settings:get |
| `hermes:quick-entry:settings:set` | `main.ts` | `quickEntry.setSettings` | replaced: vanta:quick-entry:settings:set |
| `hermes:quick-entry:state` | `main.ts` | `quickEntry.pushState`, `quickEntry.onState` | removed (member stubbed) |
| `hermes:quick-entry:submit` | `main.ts` | `quickEntry.submit`, `quickEntry.onSubmit` | removed (member stubbed) |
| `hermes:readClipboard` | `main.ts` | `readClipboard` | replaced: vanta:readClipboard |
| `hermes:readFileDataUrl` | `main.ts` | `readFileDataUrl` | replaced: vanta:fs:read-data-url |
| `hermes:readFileDataUrlForAttach` | `main.ts` | `readFileDataUrlForAttach` | removed (member stubbed) |
| `hermes:readFileText` | `main.ts` | `readFileText` | replaced: vanta:fs:read-text |
| `hermes:readPluginSource` | `main.ts` | `readPluginSource` | removed (member stubbed) |
| `hermes:requestMicrophoneAccess` | `main.ts` | `requestMicrophoneAccess` | removed (member stubbed) |
| `hermes:resolveFavicon` | `main.ts` | `resolveFavicon` | removed (member stubbed) |
| `hermes:saveClipboardImage` | `main.ts` | `saveClipboardImage` | removed (member stubbed) |
| `hermes:saveGatewayFile` | `main.ts` | `saveGatewayFile` | removed (member stubbed) |
| `hermes:saveImageBuffer` | `main.ts` | `saveImageBuffer` | removed (member stubbed) |
| `hermes:saveImageFromUrl` | `main.ts` | `saveImageFromUrl` | replaced: vanta:save-image (OS save dialog) |
| `hermes:savePastedText` | `main.ts` | `savePastedText` | removed (member stubbed) |
| `hermes:screenshot:subscribe` | `command-screenshot.ts` | `screenshot` | removed (member stubbed) |
| `hermes:secret-storage:get` | `main.ts` | `getSecretStorageEncryption` | removed (member stubbed) |
| `hermes:secret-storage:set` | `main.ts` | `setSecretStorageEncryption` | removed (member stubbed) |
| `hermes:selectPaths` | `main.ts` | `selectPaths` | replaced: vanta:selectPaths |
| `hermes:selectSavePath` | `main.ts` | `selectSavePath` | removed (member stubbed) |
| `hermes:setting:defaultProjectDir:get` | `main.ts` | `settings.getDefaultProjectDir` | replaced: vanta:project:get-default |
| `hermes:setting:defaultProjectDir:pick` | `main.ts` | `settings.pickDefaultProjectDir` | replaced: vanta:project:pick-default |
| `hermes:setting:defaultProjectDir:set` | `main.ts` | `settings.setDefaultProjectDir` | replaced: vanta:project:set-default |
| `hermes:skin:local` | `main.ts` | (none) | removed (main-internal, no renderer member) |
| `hermes:ssh-config:hosts` | `main.ts` | `sshConfigHosts` | removed (member stubbed) |
| `hermes:ssh-config:resolve` | `main.ts` | `sshResolveHost` | removed (member stubbed) |
| `hermes:startup-latency:claim` | `startup-latency-ipc.ts` | `claimStartupLatency` | removed (member stubbed) |
| `hermes:stop-find-in-page` | `main.ts` | `stopFindInPage` | replaced: vanta:stop-find-in-page |
| `hermes:stopPreviewFileWatch` | `main.ts` | `stopPreviewFileWatch` | replaced: vanta:fs:stop-watch |
| `hermes:sync-status` | `main.ts` | (none) | removed (main-internal, no renderer member) |
| `hermes:terminal:attach` | `terminal-ipc.ts` | `terminal.attach` | replaced: vanta:terminal:attach |
| `hermes:terminal:cwd` | `terminal-ipc.ts` | `terminal.cwd` | replaced: vanta:terminal:cwd |
| `hermes:terminal:dispose` | `terminal-ipc.ts` | `terminal.dispose` | replaced: vanta:terminal:dispose |
| `hermes:terminal:resize` | `terminal-ipc.ts` | `terminal.resize` | replaced: vanta:terminal:resize |
| `hermes:terminal:start` | `terminal-ipc.ts` | `terminal.start` | replaced: vanta:terminal:start |
| `hermes:terminal:write` | `terminal-ipc.ts` | `terminal.write` | replaced: vanta:terminal:write (each line is one approved command) |
| `hermes:titlebar-theme` | `main.ts` | `setTitleBarTheme` | replaced: vanta:titlebar-theme |
| `hermes:translucency` | `main.ts` | `setTranslucency` | removed (member stubbed) |
| `hermes:translucency:support` | `main.ts` | (none) | removed (main-internal, no renderer member) |
| `hermes:uninstall:openAppsSettings` | `desktop-uninstall.ts` | `uninstall.openAppsSettings` | removed (member stubbed) |
| `hermes:uninstall:run` | `desktop-uninstall.ts` | `uninstall.run` | removed (member stubbed) |
| `hermes:uninstall:summary` | `desktop-uninstall.ts` | `uninstall.summary` | removed (member stubbed) |
| `hermes:updates:apply` | `main.ts` | `updates.apply` | removed (member stubbed) |
| `hermes:updates:channel:set` | `main.ts` | `updates.setChannel` | removed (member stubbed) |
| `hermes:updates:check` | `main.ts` | `updates.check` | removed (member stubbed) |
| `hermes:version` | `main.ts` | `getVersion` | replaced: vanta:version |
| `hermes:vscode-theme:fetch` | `main.ts` | `themes.fetchMarketplace` | removed (member stubbed) |
| `hermes:vscode-theme:search` | `main.ts` | `themes.searchMarketplace` | removed (member stubbed) |
| `hermes:wake-indicator:get` | `main.ts` | `wakeIndicator.getState` | removed (member stubbed) |
| `hermes:wake-indicator:set` | `main.ts` | `wakeIndicator.setState` | removed (member stubbed) |
| `hermes:watchDirectory` | `main.ts` | `watchDirectory` | replaced: vanta:fs:watch-directory |
| `hermes:watchPreviewFile` | `main.ts` | `watchPreviewFile` | replaced: vanta:fs:watch-file |
| `hermes:window-control` | `window-controls.ts` | `windowControls.minimize`, `windowControls.toggleMaximize`, `windowControls.close` | replaced: vanta:window-control |
| `hermes:window:openBrowser` | `main.ts` | `openBrowserWindow` | removed (member stubbed) |
| `hermes:window:openInTerminal` | `main.ts` | `openSessionInTerminal` | removed (member stubbed) |
| `hermes:window:openInstance` | `main.ts` | `openWindow` | removed (member stubbed) |
| `hermes:window:openSession` | `main.ts` | `openSessionWindow` | removed (member stubbed) |
| `hermes:window:readBelow` | `main.ts` | `readWindowBelow` | removed (member stubbed) |
| `hermes:window:relay` | `main.ts` | `windowRelay.send`, `windowRelay.onMessage` | removed (member stubbed) |
| `hermes:window:size` | `window-growth.ts` | `chatOnboarding.size` | removed (member stubbed) |
| `hermes:workspace:sanitize` | `main.ts` | `sanitizeWorkspaceCwd` | replaced: vanta:workspace:sanitize |
| `hermes:writeClipboard` | `main.ts` | `writeClipboard` | replaced: vanta:writeClipboard |
| `hermes:zoom:get` | `main.ts` | `zoom.get` | replaced: local |
| `hermes:zoom:set-percent` | `main.ts` | `zoom.setPercent` | replaced: local |

### C. New channels (`electron/vanta/channels.ts`)

| Channel | Direction | Handler | Notes |
|---|---|---|---|
| `vanta:request` | renderer invoke | `request-bridge.ts` | zod-validated HTTP call to the Vanta server |
| `vanta:focus-client` | renderer send | `shell-handlers.ts`, `request-bridge.ts` | the chat in front (or `null`); picks where approval cards from the terminal and Changes panes appear |
| `vanta:events:open`, `vanta:events:close` | renderer send | `shell-handlers.ts` | open or close one SSE stream, keyed by renderer-chosen stream id |
| `vanta:events:frame`, `vanta:events:closed` | main push | `request-bridge.ts` | one parsed JSON frame, or the close reason |
| `vanta:connection` | invoke | `shell-handlers.ts` | waits for the server, then returns the connection descriptor (placeholder token) |
| `vanta:boot-progress:get`, `vanta:boot-progress` | invoke, push | `shell-state.ts` | boot tracker: starting, verifying, ready, failed with reason |
| `vanta:backend-exit` | push | `server-host.ts` | the runtime died after it was ready |
| `vanta:window-control` | send | `window-host.ts` | `minimize`, `toggle-maximize`, `close` |
| `vanta:window-state-changed`, `vanta:power-resume` | push | `window-host.ts` | |
| `vanta:native-theme`, `vanta:titlebar-theme` | send | `window-host.ts` | |
| `vanta:openExternal`, `vanta:fs:reveal`, `vanta:fs:openDir`, `vanta:selectPaths`, `vanta:workspace:sanitize` | invoke | `native-handlers.ts` | see section 2 |
| `vanta:readClipboard`, `vanta:read-clipboard`, `vanta:writeClipboard` | invoke | `native-handlers.ts` | |
| `vanta:logs:recent`, `vanta:logs:reveal`, `vanta:logs:renderer-line`, `vanta:logs:renderer-error` | invoke, send | `shell-handlers.ts`, `native-handlers.ts` | |
| `vanta:version` | invoke | `shell-handlers.ts` | |
| `vanta:project:get-default`, `vanta:project:pick-default`, `vanta:project:set-default` | invoke | `project-handlers.ts` | the project folder is the runtime's root |
| `vanta:pick-project-folder`, `vanta:switch-project-for-new-task`, `vanta:read-pending-project-task`, `vanta:acknowledge-pending-project-task` | invoke | `project-handlers.ts` | carried over from the Vanta shell (`window.vantaDesktop`) |
| `vanta:resolve-dropped-paths`, `vanta:pick-attachments` | invoke | `project-handlers.ts` | carried over from the Vanta shell |
| `hermes:notify`, `hermes:notification-action`, `hermes:notification-activate`, `hermes:focus-session` | invoke, push | reused `notification-ipc.ts` | module unchanged |
| `hermes:machine:profile` | invoke | reused `machine-profile.ts` | module unchanged |
| `vanta:fs:read-dir`, `vanta:fs:git-root`, `vanta:fs:read-text`, `vanta:fs:read-data-url`, `vanta:fs:normalize-preview` | invoke | `fs-handlers.ts`, `fs-read.ts`, `fs-preview.ts` | read-only, project-confined (section 2) |
| `vanta:fs:watch-directory`, `vanta:fs:watch-file`, `vanta:fs:stop-watch`, `hermes:preview-file-changed` | invoke, push | `fs-watch.ts` | |
| `vanta:git:repo-status`, `file-diff`, `branch-list`, `base-branch-list`, `worktree-list`, `scan-repos`, `review-list`, `review-diff`, `review-rev-parse`, `review-ship-info`, `review-pr-list` | invoke | `git-handlers.ts`, `git-read.ts`, `git-diff.ts`, `git-branches.ts` | allow-listed read-only git |
| `vanta:git:mutate` | invoke | `git-mutation-handlers.ts`, `git-mutations.ts`, `git-worktree-plans.ts` | approval flow |
| `vanta:git:mutation` | invoke | `git-handlers.ts` | refusal for `createPr` |
| `vanta:terminal:start`, `write`, `resize`, `attach`, `cwd`, `dispose`, `vanta:terminal:data`, `vanta:terminal:exit` | invoke, push | `terminal-gated.ts`, `terminal-line.ts` | no pty; each line is one approved command |
| `vanta:fs:rename`, `vanta:fs:trash`, `vanta:save-image` | invoke | `file-actions.ts` | native confirmation or save dialog |
| `vanta:find-in-page`, `vanta:stop-find-in-page`, `hermes:found-in-page`, `hermes:open-find-bar` | invoke, push | `find-handlers.ts` | reuses `find-in-page.ts` |
| `vanta:zoom:persist`, `hermes:zoom:changed` | send, push | `zoom-controller.ts` | zoom is saved in `userData/zoom.json` |
| `vanta:keep-awake`, `vanta:active-work`, `vanta:power-battery:get`, `hermes:power-battery` | send, invoke, push | `power-features.ts` | reuses `power-save.ts`; mode in `userData/keep-awake.json` |
| `hermes:open-folder-requested`, `hermes:close-preview-requested` | push | `app-menu.ts` | File menu items |
| `hermes:deep-link`, `vanta:deep-link-ready` | push, invoke | `deep-links.ts` | `vanta://` |
| `hermes:external-open-failed` | push | `external-links.ts` | |
| `hermes:hud:*` | invoke, send, push | reused `hud-ipc.ts`, `mini-window.ts`, `mini-window-controller.ts` | the mini window |
| `vanta:quick-entry:settings:get`, `settings:set`, `submit`, `ack`, `dismiss`, `state`, `to-main`, `shown`, `late-result` | invoke, send, push | `quick-entry-host.ts` | reuses `quick-entry.ts` helpers; settings in `userData/quick-entry.json` |
| `vanta:minimize-to-tray:get`, `set`, `changed` | invoke, push | `tray-setting.ts`, `vanta-tray.ts` | `userData/tray.json` |
| `vanta:context-menu:edit`, `copy-image`, `spellcheck`, `hermes:context-menu-spellcheck` | invoke, push | `context-menu.ts` | |

`window.vantaDesktop` (Vanta-only): `pickProjectFolder`, `switchProjectForNewTask`, `readPendingProjectTask`, `acknowledgePendingProjectTask`,
`resolveDroppedFiles`, `pickAttachments`, `readClipboard`. Dropped from the old Vanta preload: `boundaryToken` (the renderer must never see it) and
`readSurfaceMode`/`setSurfaceMode`/`reportSurfacePhase`/`onSurfaceMode` (the old resize-in-place mini surface and avatar; the HUD-based mini window of R2 replaces them).

### D. Main to renderer push channels

Kept (23): `hermes:backend-exit` -> `vanta:backend-exit`, `hermes:boot-progress` -> `vanta:boot-progress`, `hermes:focus-session` -> `hermes:focus-session (module reused)`, `hermes:notification-action` -> `hermes:notification-action (module reused)`, `hermes:notification-activate` -> `hermes:notification-activate (module reused)`, `hermes:power-resume` -> `vanta:power-resume`, `hermes:window-state-changed` -> `vanta:window-state-changed`, `hermes:close-preview-requested`, `hermes:context-menu-spellcheck`, `hermes:deep-link`, `hermes:external-open-failed`, `hermes:found-in-page`, `hermes:hud:changed` -> `hermes:hud:changed (reused hud-ipc.ts)`, `hermes:hud:goto`, `hermes:minimize-to-tray:changed` -> `vanta:minimize-to-tray:changed`, `hermes:open-find-bar`, `hermes:open-folder-requested`, `hermes:power-battery`, `hermes:quick-entry:late-result` -> `vanta:quick-entry:late-result`, `hermes:quick-entry:shown` -> `vanta:quick-entry:shown`, `hermes:quick-entry:state` -> `vanta:quick-entry:state`, `hermes:quick-entry:submit` -> `vanta:quick-entry:to-main`, `hermes:zoom:changed`.

Removed (49): `hermes:active-work`, `hermes:bootstrap:event`, `hermes:browser-popout:closed`, `hermes:connection:active-route`, `hermes:connection:applied`, `hermes:connections:changed`, `hermes:devtools:disable-f12`, `hermes:f12-shortcut`, `hermes:f12ShortcutActive`, `hermes:hud-modifier:status`, `hermes:hud:begin-move`, `hermes:hud:cursor`, `hermes:hud:end-move`, `hermes:hud:game-overlay`, `hermes:hud:ignore-mouse`, `hermes:hud:move-by`, `hermes:hud:session`, `hermes:hud:set-bounds`, `hermes:hud:workspace-transfer`, `hermes:keep-awake`, `hermes:logs:renderer-error`, `hermes:logs:renderer-line`, `hermes:native-theme`, `hermes:open-updates`, `hermes:pet-overlay:control`, `hermes:pet-overlay:ignore-mouse`, `hermes:pet-overlay:set-bounds`, `hermes:pet-overlay:set-focusable`, `hermes:pet-overlay:state`, `hermes:pool:retiring`, `hermes:preview-guest-hidden`, `hermes:preview-nav`, `hermes:previewShortcutActive`, `hermes:profile:default:changed`, `hermes:quick-entry:ack`, `hermes:quick-entry:dismiss`, `hermes:screenshot:request`, `hermes:screenshot:status`, `hermes:screenshot:subscribe`, `hermes:titlebar-theme`, `hermes:translucency`, `hermes:updates:metric:pending`, `hermes:updates:progress`, `hermes:wake-indicator:set`, `hermes:wake-indicator:state`, `hermes:window-control`, `hermes:window:relay`, `hermes:window:size`, `hermes:zoom:set-percent`.

## 4. What was not verified

- The packaged app. The Vanta shell was run in real Electron 40.10.2 from a throwaway app folder with the bundled `electron-main.mjs` and `electron-preload.js`
  (see the DN-07 report), not from `electron-builder` output. Packaging the Vanta runtime (`vanta-ts`, Node dependencies, kernel binary) as an
  `extraResources` folder is not done; `VANTA_RUNTIME_ROOT` or `<resources>/vanta-runtime` is where the shell looks.
- `previewGuestPreload` is still emitted by the bundler and unused (`webviewTag` is off).
- R2 (native capabilities) ran in a hidden Electron 40.10.2 window with an isolated userData folder and windows kept off screen. Executed: the application
  menu, zoom save and restore, find-in-page match counting, the keep-awake blocker, `vanta://` routing, quick entry end to end (global shortcut
  registration, state replay, a prompt relayed to the main renderer and acknowledged, a forged submit refused), the mini window loading the HUD variant,
  and the whole wiring through the real preload (file, git, terminal, battery and tray members). Executed against the real Vanta runtime and kernel:
  the gated terminal, stage, commit, revert and worktree add or remove (`terminal-gated.real.test.ts`, `git-mutations.real.test.ts`; both skip when
  `target/debug/vanta-kernel` is not built).
- Not executed in a real Electron run: the real `Tray` object (a menu-bar icon would have appeared), the native Rename/Trash/save dialogs (the dialog
  functions are injected and tested with fakes), the macOS dock badge, `app.setAsDefaultProtocolClient` (packaged builds only), a real renderer UI
  driving any of these members, and any non-macOS platform.

## 5. Native capabilities restored (R2)

### 5.1 Model

The renderer never gets arbitrary exec, fs or network. Four mechanisms cover everything R2 enabled:

1. **Project guard** (`project-guard.ts`) for reads. A path is usable only when its realpath is inside the active project root. Secret locations are refused
   even inside it. Reads are size-capped and `O_NOFOLLOW`.
2. **Allow-listed git runner** (`git-runner.ts`) for git reads. Argv is built in main; the renderer supplies only typed values.
3. **Approval flow** for every change that runs a command: main builds the exact command and sends it to the Vanta server's `POST /api/terminal`, which applies
   the kernel's decision, the approval card and the OS sandbox. This covers git changes and the terminal pane.
4. **Native confirmation or save dialog** for changes that are not commands (Rename, Trash, Save image). The dialog names the exact path and the page
   cannot answer it.

### 5.2 What came back

| Capability | Inventory | Mechanism | Tests |
|---|---|---|---|
| Files pane tree, preview, watch | F-095, F-096 | guard | `project-guard`, `fs-read`, `fs-watch`, `fs-watch.real`, `fs-handlers` |
| Changes pane reads (status, list, diff, rev-parse, branches, worktree list) | F-098 | git runner | `git-runner`, `git-parse`, `git-read`, `git-handlers` |
| Stage, unstage, revert, commit, push, branch switch | F-099, F-100 | approval flow | `git-mutations`, `git-mutations.real` |
| New worktree, remove worktree | F-052 | approval flow | `git-mutations`, `git-mutations.real` |
| Create PR, Open PR badge | F-100 | not available: needs `gh`; badge reports no PR | `git-handlers` |
| File context menu: Rename, Delete | F-097 | native confirmation | `file-actions` |
| Image save | F-154 | OS save dialog | `file-actions` |
| Terminal | F-101, F-102, F-190 | approval flow, no pty | `terminal-line`, `terminal-gated`, `terminal-gated.real` |
| Application menu, Window, Help | F-195 to F-200 | local | `app-menu` |
| Find in page | F-207 | local | `find-handlers` |
| Zoom saved across launches, View menu zoom | F-198 | local | `zoom-controller` |
| Keep awake, battery events | F-211 | local | `power-features` |
| `vanta://` links | F-209 | local, allowlisted kinds | `deep-links` |
| External link failures | F-209 | local | `external-links` |
| Notification actions (focus session) | F-206 | unchanged reused module | existing |
| Mini window (HUD replacement) | F-004, F-203 | local | `mini-window-controller` |
| Tray, minimize to tray, Needs you count, badge | F-201, F-178 | local plus pending-approval read | `vanta-tray`, `tray-setting` |
| Quick entry | F-202, F-178 | local, relayed to the main window | `quick-entry-host` |
| Context menu verbs | F-191 | allowlist | `context-menu` |

### 5.3 Refused or left unsupported, and why

- **A pty.** `node-pty` 1.1.0's prebuilt `darwin-arm64` binary loads and runs in Electron 40.10.2 (ABI 143, Node 24.15) with no rebuild; this was executed.
  So a real terminal is technically possible. It is not shipped because a pty is arbitrary command execution that skips the approval flow, and a
  compromised renderer could write to it. The gated line terminal gives the same panes with every command approved. Interactive programs, `cd`, and
  stopping a running command are the cost.
- **Renderer file writes** (`writeTextFile`, `saveImageBuffer`, `savePastedText`, `saveClipboardImage`, `saveGatewayFile`, `selectSavePath`): no equivalent of a
  native dialog or approval card fits an in-page editor save; left unsupported.
- **Plugin install, updates, SSH, cloud, telemetry, marketplace, outbound fetches chosen by the page:** exec or network under renderer control. Unchanged from DN-07.
- **Create PR and PR badges:** need the `gh` CLI and a network call; reported as unavailable instead of faked.
- **Multi-window** (`openWindow`, session windows, browser pop-out, `windowRelay`): the shell has one main window; not built.
- **Install-type deep links** (plugin, skill, MCP): they run code; dropped until they can go through the approval flow.
- **HUD game overlay, modifier gesture and snap shortcut:** dropped by the owner or not ported (global hotkeys beyond quick entry).

### 5.4 Known limits and open questions

- Terminal and repository changes show their approval card in the chat the renderer reports as in front (`vanta:focus-client`, sent from `src/store/focused-client.ts` whenever the active chat changes). If that chat's event stream is not open, the card goes to the chat whose stream the window opened last. If no chat is open, nothing runs and the pane says so.
- A repository whose root is above the project folder is not readable; `gitRoot` never climbs past the project root.
- Images outside the project (a screenshot in `/tmp` the agent mentions) cannot be previewed: reads are project-only. A per-session grant for files the user
  picked in a native dialog would fix this and is not built.
- `git add` and similar inside the project run without a card if the kernel allows them, exactly as for the agent. Whether Changes-pane buttons should always ask
  is a product question for the owner.
- Rename and Trash act on the real path of a symlink, and the confirmation shows that real path.
