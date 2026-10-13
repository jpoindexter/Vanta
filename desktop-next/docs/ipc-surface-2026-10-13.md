# IPC surface of the Vanta shell (2026-10-13, DN-07)

What `window.hermesDesktop`, `window.vantaDesktop` and the Electron main process expose after the facade, against the Hermes
surface it replaces. Source of truth for the code: `apps/desktop/electron/vanta/` (`channels.ts` lists every new channel).
Regenerate the stub inventory with `node scripts/generate-bridge-manifest.mjs` (then prettier).

## 1. Summary

| | Hermes shell | Vanta shell |
|---|---|---|
| `ipcMain` channels registered | 206 literal + 1 computed (`command-screenshot.ts`) across `electron/*.ts` | 41 channels in use: 36 new `vanta:*`, 5 `hermes:*` from two reused unchanged modules (table C). 37 old channels have a Vanta counterpart |
| `window.hermesDesktop` members (leaves) | 268 | 268 present: 51 real, 217 typed-unsupported or absent (`screenshot`, `hudModifier`, macOS-only, left undefined) |
| Main to renderer push channels | 72 | 7 kept, the rest removed |
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

Removed outright (no handler, no stub behind it): `writeTextFile`, `renamePath`, `trashPath`, `saveImageBuffer`, `saveImageFromUrl`,
`saveGatewayFile`, `selectSavePath` (file writes); `readFileText`, `readFileDataUrl*`, `readPluginSource`, `readDir`, `watchDirectory`,
`watchPreviewFile`, `capturePreview` (arbitrary reads); `terminal.*` (node-pty), `git.*` (executes git, including push and PR),
`openSessionInTerminal`, `installDesktopPlugin`/`removeDesktopPlugin`/`reconcileDesktopPlugins` (executes npm or git),
`updates.*`/`updateHold.*`/`uninstall.*`/`repairBootstrap`/`recycleBackend` (runs installers and the Python backend), `sshConfigHosts`/`sshResolveHost`,
`fetchLinkTitle`/`resolveFavicon`/`reachPreviewUrl`/`probePluginRepo` (renderer-chosen outbound requests), `cloud.*`, `mcpOauth`, OAuth connection config,
`desktopMetrics`/`themes.fetchMarketplace` (telemetry and marketplace). These return when a later slice needs them, each behind the effect gate
(`docs/hermes-feature-matrix-2026-10-13.md` section 3, "Later").

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
| `setActiveWork` | `hermes:active-work` | no-op |
| `setTitleBarTheme` | `hermes:titlebar-theme` | vanta:titlebar-theme |
| `setNativeTheme` | `hermes:native-theme` | vanta:native-theme |
| `openExternal` | `hermes:openExternal` | vanta:openExternal |
| `sanitizeWorkspaceCwd` | `hermes:workspace:sanitize` | vanta:workspace:sanitize |
| `settings.getDefaultProjectDir` | `hermes:setting:defaultProjectDir:get` | vanta:project:get-default |
| `settings.setDefaultProjectDir` | `hermes:setting:defaultProjectDir:set` | vanta:project:set-default |
| `settings.pickDefaultProjectDir` | `hermes:setting:defaultProjectDir:pick` | vanta:project:pick-default |
| `zoom.get` | `hermes:zoom:get` | `webFrame`, in preload |
| `zoom.factor` | (local) | `webFrame`, in preload |
| `zoom.setPercent` | `hermes:zoom:set-percent` | `webFrame`, clamped 50-300% |
| `zoom.onChanged` | `hermes:zoom:changed` | local listeners |
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
| `hud.nativeDrag` | (local value) | typed unsupported |  |
| `hud.windowing.clientPlacement` | (local value) | typed unsupported |  |
| `hud.windowing.controlDrag` | (local value) | typed unsupported |  |
| `hud.windowing.nativeDrag` | (local value) | typed unsupported |  |
| `hud.windowing.solid` | (local value) | typed unsupported |  |
| `hud.windowing.workspaceTransfer` | (local value) | typed unsupported |  |
| `hud.open` | `hermes:hud:open` | typed unsupported |  |
| `hud.close` | `hermes:hud:close` | typed unsupported |  |
| `hud.setIgnoreMouse` | `hermes:hud:ignore-mouse` | typed unsupported |  |
| `hud.beginMove` | `hermes:hud:begin-move` | typed unsupported |  |
| `hud.endMove` | `hermes:hud:end-move` | typed unsupported |  |
| `hud.moveBy` | `hermes:hud:move-by` | typed unsupported |  |
| `hud.setWorkspaceTransfer` | `hermes:hud:workspace-transfer` | typed unsupported |  |
| `hud.setBounds` | `hermes:hud:set-bounds` | typed unsupported |  |
| `hud.resetLayout` | `hermes:hud:reset-layout` | typed unsupported |  |
| `hud.setFrost` | `hermes:hud:frost` | typed unsupported |  |
| `hud.setSession` | `hermes:hud:session` | typed unsupported |  |
| `hud.onGoto` | `hermes:hud:goto` | typed unsupported |  |
| `hud.onChanged` | `hermes:hud:changed` | typed unsupported |  |
| `hud.onCursor` | `hermes:hud:cursor` | typed unsupported |  |
| `hud.onGameOverlay` | `hermes:hud:game-overlay` | typed unsupported |  |
| `hudModifier` | `hermes:hud-modifier:settings:get`, `hermes:hud-modifier:settings:set`, `hermes:hud-modifier:permission`, `hermes:hud-modifier:status` | typed unsupported |  |
| `screenshot` | `hermes:screenshot:settings:get`, `hermes:screenshot:settings:set`, `hermes:screenshot:permission`, `hermes:screenshot:capture`, `hermes:screenshot:status`, `hermes:screenshot:subscribe` | typed unsupported |  |
| `quickEntry.getSettings` | `hermes:quick-entry:settings:get` | typed unsupported | exec/process |
| `quickEntry.setSettings` | `hermes:quick-entry:settings:set` | typed unsupported | exec/process |
| `quickEntry.submit` | `hermes:quick-entry:submit` | typed unsupported | exec/process |
| `quickEntry.ackSubmit` | `hermes:quick-entry:ack` | typed unsupported | exec/process |
| `quickEntry.dismiss` | `hermes:quick-entry:dismiss` | typed unsupported | exec/process |
| `quickEntry.pushState` | `hermes:quick-entry:state` | typed unsupported | exec/process |
| `quickEntry.onState` | `hermes:quick-entry:state` | typed unsupported | exec/process |
| `quickEntry.onSubmit` | `hermes:quick-entry:submit` | typed unsupported | exec/process |
| `quickEntry.onShown` | `hermes:quick-entry:shown` | typed unsupported | exec/process |
| `quickEntry.onLateResult` | `hermes:quick-entry:late-result` | typed unsupported | exec/process |
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
| `readFileDataUrl` | `hermes:readFileDataUrl` | typed unsupported | fs-read |
| `readFileDataUrlForAttach` | `hermes:readFileDataUrlForAttach` | typed unsupported | fs-read |
| `dataUrlReadMax.get` | `hermes:data-url-read-max:get` | typed unsupported | fs-read |
| `dataUrlReadMax.set` | `hermes:data-url-read-max:set` | typed unsupported | fs-read |
| `readFileText` | `hermes:readFileText` | typed unsupported | fs-read |
| `readPluginSource` | `hermes:readPluginSource` | typed unsupported | fs-read |
| `selectSavePath` | `hermes:selectSavePath` | typed unsupported | fs-write |
| `saveGatewayFile` | `hermes:saveGatewayFile` | typed unsupported | fs-write |
| `saveImageFromUrl` | `hermes:saveImageFromUrl` | typed unsupported | fs-write |
| `contextMenuEdit` | `hermes:context-menu:edit` | typed unsupported |  |
| `contextMenuCopyImage` | `hermes:context-menu:copy-image` | typed unsupported |  |
| `contextMenuSpellcheck` | `hermes:context-menu:spellcheck` | typed unsupported |  |
| `contextMenuGuestAddWord` | `hermes:context-menu:guest-add-word` | typed unsupported |  |
| `onContextMenuSpellcheck` | `hermes:context-menu-spellcheck` | typed unsupported |  |
| `saveImageBuffer` | `hermes:saveImageBuffer` | typed unsupported | fs-write |
| `capturePreview` | `hermes:capturePreview` | typed unsupported | fs-read |
| `savePastedText` | `hermes:savePastedText` | typed unsupported | fs-write |
| `saveClipboardImage` | `hermes:saveClipboardImage` | typed unsupported | fs-write |
| `normalizePreviewTarget` | `hermes:normalizePreviewTarget` | typed unsupported | fs-read |
| `watchPreviewFile` | `hermes:watchPreviewFile` | typed unsupported | fs-read |
| `watchDirectory` | `hermes:watchDirectory` | typed unsupported | fs-read |
| `stopPreviewFileWatch` | `hermes:stopPreviewFileWatch` | typed unsupported | fs-read |
| `setTranslucency` | `hermes:translucency` | typed unsupported |  |
| `setKeepAwake` | `hermes:keep-awake` | typed unsupported |  |
| `minimizeToTray.get` | `hermes:minimize-to-tray:get` | typed unsupported |  |
| `minimizeToTray.set` | `hermes:minimize-to-tray:set` | typed unsupported |  |
| `minimizeToTray.onChanged` | `hermes:minimize-to-tray:changed` | typed unsupported |  |
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
| `readDir` | `hermes:fs:readDir` | typed unsupported | fs-read |
| `gitRoot` | `hermes:fs:gitRoot` | typed unsupported | fs-read |
| `desktopPluginsRoot` | `hermes:fs:desktopPluginsRoot` | typed unsupported | fs-read |
| `reconcileDesktopPlugins` | `hermes:fs:reconcileDesktopPlugins` | typed unsupported | exec/process |
| `logsRoot` | `hermes:fs:logsRoot` | typed unsupported | fs-read |
| `renamePath` | `hermes:fs:rename` | typed unsupported | fs-write |
| `writeTextFile` | `hermes:fs:writeText` | typed unsupported | fs-write |
| `trashPath` | `hermes:fs:trash` | typed unsupported | fs-write |
| `git.worktreeList` | `hermes:git:worktreeList` | typed unsupported | exec/process |
| `git.worktreeAdd` | `hermes:git:worktreeAdd` | typed unsupported | exec/process |
| `git.worktreeRemove` | `hermes:git:worktreeRemove` | typed unsupported | exec/process |
| `git.branchSwitch` | `hermes:git:branchSwitch` | typed unsupported | exec/process |
| `git.branchList` | `hermes:git:branchList` | typed unsupported | exec/process |
| `git.baseBranchList` | `hermes:git:baseBranchList` | typed unsupported | exec/process |
| `git.repoStatus` | `hermes:git:repoStatus` | typed unsupported | exec/process |
| `git.fileDiff` | `hermes:git:fileDiff` | typed unsupported | exec/process |
| `git.scanRepos` | `hermes:git:scanRepos` | typed unsupported | exec/process |
| `git.review.list` | `hermes:git:review:list` | typed unsupported | exec/process |
| `git.review.diff` | `hermes:git:review:diff` | typed unsupported | exec/process |
| `git.review.stage` | `hermes:git:review:stage` | typed unsupported | exec/process |
| `git.review.unstage` | `hermes:git:review:unstage` | typed unsupported | exec/process |
| `git.review.revert` | `hermes:git:review:revert` | typed unsupported | exec/process |
| `git.review.revParse` | `hermes:git:review:revParse` | typed unsupported | exec/process |
| `git.review.commit` | `hermes:git:review:commit` | typed unsupported | exec/process |
| `git.review.commitContext` | `hermes:git:review:commitContext` | typed unsupported | exec/process |
| `git.review.push` | `hermes:git:review:push` | typed unsupported | exec/process |
| `git.review.shipInfo` | `hermes:git:review:shipInfo` | typed unsupported | exec/process |
| `git.review.prList` | `hermes:git:review:prList` | typed unsupported | exec/process |
| `git.review.createPr` | `hermes:git:review:createPr` | typed unsupported | exec/process |
| `terminal.attach` | `hermes:terminal:attach` | typed unsupported | exec/process |
| `terminal.cwd` | `hermes:terminal:cwd` | typed unsupported | exec/process |
| `terminal.dispose` | `hermes:terminal:dispose` | typed unsupported | exec/process |
| `terminal.resize` | `hermes:terminal:resize` | typed unsupported | exec/process |
| `terminal.start` | `hermes:terminal:start` | typed unsupported | exec/process |
| `terminal.write` | `hermes:terminal:write` | typed unsupported | exec/process |
| `terminal.onData` | (local value) | typed unsupported | exec/process |
| `terminal.onExit` | (local value) | typed unsupported | exec/process |
| `onClosePreviewRequested` | `hermes:close-preview-requested` | typed unsupported |  |
| `onPreviewNav` | `hermes:preview-nav` | typed unsupported |  |
| `onOpenFolderRequested` | `hermes:open-folder-requested` | typed unsupported |  |
| `onOpenUpdatesRequested` | `hermes:open-updates` | typed unsupported |  |
| `onDeepLink` | `hermes:deep-link` | typed unsupported |  |
| `signalDeepLinkReady` | `hermes:deep-link-ready` | typed unsupported |  |
| `probePluginRepo` | `hermes:plugin:probe` | typed unsupported | network/credentials |
| `installDesktopPlugin` | `hermes:plugin:installDesktop` | typed unsupported | exec/process |
| `removeDesktopPlugin` | `hermes:plugin:removeDesktop` | typed unsupported | exec/process |
| `onExternalOpenFailed` | `hermes:external-open-failed` | typed unsupported |  |
| `onPreviewFileChanged` | `hermes:preview-file-changed` | typed unsupported |  |
| `onPoolBackendRetiring` | `hermes:pool:retiring` | typed unsupported |  |
| `onConnectionApplied` | `hermes:connection:applied` | typed unsupported |  |
| `getOnBattery` | `hermes:power-battery:get` | typed unsupported |  |
| `onBatteryChanged` | `hermes:power-battery` | typed unsupported |  |
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
| `findInPage` | `hermes:find-in-page` | typed unsupported |  |
| `stopFindInPage` | `hermes:stop-find-in-page` | typed unsupported |  |
| `onFoundInPage` | `hermes:found-in-page` | typed unsupported |  |
| `onOpenFindBarRequested` | `hermes:open-find-bar` | typed unsupported |  |

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
| `hermes:context-menu:copy-image` | `main.ts` | `contextMenuCopyImage` | removed (member stubbed) |
| `hermes:context-menu:edit` | `main.ts` | `contextMenuEdit` | removed (member stubbed) |
| `hermes:context-menu:guest-add-word` | `main.ts` | `contextMenuGuestAddWord` | removed (member stubbed) |
| `hermes:context-menu:spellcheck` | `main.ts` | `contextMenuSpellcheck` | removed (member stubbed) |
| `hermes:data-url-read-max:get` | `main.ts` | `dataUrlReadMax.get` | removed (member stubbed) |
| `hermes:data-url-read-max:set` | `main.ts` | `dataUrlReadMax.set` | removed (member stubbed) |
| `hermes:deep-link-ready` | `main.ts` | `signalDeepLinkReady` | removed (member stubbed) |
| `hermes:devtools:disable-f12` | `main.ts` | `setDisableF12` | removed (member stubbed) |
| `hermes:embed-host:origin` | `main.ts` | `getEmbedHostOrigin` | removed (member stubbed) |
| `hermes:f12ShortcutActive` | `main.ts` | `setF12ShortcutActive` | removed (member stubbed) |
| `hermes:feature-flags` | `main.ts` | (none) | removed (main-internal, no renderer member) |
| `hermes:fetchLinkTitle` | `main.ts` | `fetchLinkTitle` | removed (member stubbed) |
| `hermes:find-in-page` | `main.ts` | `findInPage` | removed (member stubbed) |
| `hermes:freeTierChallenge:run` | `challenge-window-ipc.ts` | `freeTierChallenge.run` | removed (member stubbed) |
| `hermes:fs:desktopPluginsRoot` | `fs-ipc.ts` | `desktopPluginsRoot` | removed (member stubbed) |
| `hermes:fs:gitRoot` | `fs-ipc.ts` | `gitRoot` | removed (member stubbed) |
| `hermes:fs:logsRoot` | `fs-ipc.ts` | `logsRoot` | removed (member stubbed) |
| `hermes:fs:openDir` | `fs-ipc.ts` | `openDir` | replaced: vanta:fs:openDir |
| `hermes:fs:readDir` | `fs-ipc.ts` | `readDir` | removed (member stubbed) |
| `hermes:fs:reconcileDesktopPlugins` | `fs-ipc.ts` | `reconcileDesktopPlugins` | removed (member stubbed) |
| `hermes:fs:rename` | `fs-ipc.ts` | `renamePath` | removed (member stubbed) |
| `hermes:fs:reveal` | `fs-ipc.ts` | `revealPath` | replaced: vanta:fs:reveal |
| `hermes:fs:trash` | `fs-ipc.ts` | `trashPath` | removed (member stubbed) |
| `hermes:fs:writeText` | `fs-ipc.ts` | `writeTextFile` | removed (member stubbed) |
| `hermes:gateway:ws-url` | `main.ts` | `getGatewayWsUrl` | replaced: local |
| `hermes:gateway:ws-url-for` | `main.ts` | `getGatewayWsUrlFor` | replaced: local |
| `hermes:get-remote-display-reason` | `main.ts` | `getRemoteDisplayReason` | removed (member stubbed) |
| `hermes:git:baseBranchList` | `git-ipc.ts` | `git.baseBranchList` | removed (member stubbed) |
| `hermes:git:branchList` | `git-ipc.ts` | `git.branchList` | removed (member stubbed) |
| `hermes:git:branchSwitch` | `git-ipc.ts` | `git.branchSwitch` | removed (member stubbed) |
| `hermes:git:fileDiff` | `git-ipc.ts` | `git.fileDiff` | removed (member stubbed) |
| `hermes:git:repoStatus` | `git-ipc.ts` | `git.repoStatus` | removed (member stubbed) |
| `hermes:git:review:commit` | `git-ipc.ts` | `git.review.commit` | removed (member stubbed) |
| `hermes:git:review:commitContext` | `git-ipc.ts` | `git.review.commitContext` | removed (member stubbed) |
| `hermes:git:review:createPr` | `git-ipc.ts` | `git.review.createPr` | removed (member stubbed) |
| `hermes:git:review:diff` | `git-ipc.ts` | `git.review.diff` | removed (member stubbed) |
| `hermes:git:review:list` | `git-ipc.ts` | `git.review.list` | removed (member stubbed) |
| `hermes:git:review:prList` | `git-ipc.ts` | `git.review.prList` | removed (member stubbed) |
| `hermes:git:review:push` | `git-ipc.ts` | `git.review.push` | removed (member stubbed) |
| `hermes:git:review:revParse` | `git-ipc.ts` | `git.review.revParse` | removed (member stubbed) |
| `hermes:git:review:revert` | `git-ipc.ts` | `git.review.revert` | removed (member stubbed) |
| `hermes:git:review:shipInfo` | `git-ipc.ts` | `git.review.shipInfo` | removed (member stubbed) |
| `hermes:git:review:stage` | `git-ipc.ts` | `git.review.stage` | removed (member stubbed) |
| `hermes:git:review:unstage` | `git-ipc.ts` | `git.review.unstage` | removed (member stubbed) |
| `hermes:git:scanRepos` | `git-ipc.ts` | `git.scanRepos` | removed (member stubbed) |
| `hermes:git:worktreeAdd` | `git-ipc.ts` | `git.worktreeAdd` | removed (member stubbed) |
| `hermes:git:worktreeList` | `git-ipc.ts` | `git.worktreeList` | removed (member stubbed) |
| `hermes:git:worktreeRemove` | `git-ipc.ts` | `git.worktreeRemove` | removed (member stubbed) |
| `hermes:hud-modifier:${name}` | `hud-modifier.ts` | (none) | removed (main-internal, no renderer member) |
| `hermes:hud:begin-move` | `hud-ipc.ts` | `hud.beginMove` | removed (member stubbed) |
| `hermes:hud:close` | `hud-ipc.ts` | `hud.close` | removed (member stubbed) |
| `hermes:hud:end-move` | `hud-ipc.ts` | `hud.endMove` | removed (member stubbed) |
| `hermes:hud:frost` | `hud-ipc.ts` | `hud.setFrost` | removed (member stubbed) |
| `hermes:hud:ignore-mouse` | `hud-ipc.ts` | `hud.setIgnoreMouse` | removed (member stubbed) |
| `hermes:hud:move-by` | `hud-ipc.ts` | `hud.moveBy` | removed (member stubbed) |
| `hermes:hud:native-drag` | `hud-ipc.ts` | (none) | removed (main-internal, no renderer member) |
| `hermes:hud:open` | `hud-ipc.ts` | `hud.open` | removed (member stubbed) |
| `hermes:hud:reset-layout` | `hud-ipc.ts` | `hud.resetLayout` | removed (member stubbed) |
| `hermes:hud:session` | `hud-ipc.ts` | `hud.setSession` | removed (member stubbed) |
| `hermes:hud:set-bounds` | `hud-ipc.ts` | `hud.setBounds` | removed (member stubbed) |
| `hermes:hud:windowing` | `hud-ipc.ts` | (none) | removed (main-internal, no renderer member) |
| `hermes:hud:workspace-transfer` | `hud-ipc.ts` | `hud.setWorkspaceTransfer` | removed (member stubbed) |
| `hermes:keep-awake` | `main.ts` | `setKeepAwake` | removed (member stubbed) |
| `hermes:local-backend:probe` | `main.ts` | `probeLocalBackend` | replaced: local |
| `hermes:logs:recent` | `main.ts` | `getRecentLogs` | replaced: vanta:logs:recent |
| `hermes:logs:renderer-error` | `main.ts` | `reportRendererError` | replaced: vanta:logs:renderer-error |
| `hermes:logs:renderer-line` | `main.ts` | `logLine` | replaced: vanta:logs:renderer-line |
| `hermes:logs:reveal` | `main.ts` | `revealLogs` | replaced: vanta:logs:reveal |
| `hermes:machine:profile` | `machine-profile.ts` | `getMachineProfile` | replaced: hermes:machine:profile (module reused) |
| `hermes:mcp-oauth:cancel` | `mcp-oauth-callback-ipc.ts` | `mcpOauth.cancel` | removed (member stubbed) |
| `hermes:mcp-oauth:listen` | `mcp-oauth-callback-ipc.ts` | `mcpOauth.listen` | removed (member stubbed) |
| `hermes:mcp-oauth:wait` | `mcp-oauth-callback-ipc.ts` | `mcpOauth.wait` | removed (member stubbed) |
| `hermes:minimize-to-tray:get` | `minimize-to-tray.ts` | `minimizeToTray.get` | removed (member stubbed) |
| `hermes:minimize-to-tray:set` | `minimize-to-tray.ts` | `minimizeToTray.set` | removed (member stubbed) |
| `hermes:native-theme` | `main.ts` | `setNativeTheme` | replaced: vanta:native-theme |
| `hermes:normalizePreviewTarget` | `main.ts` | `normalizePreviewTarget` | removed (member stubbed) |
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
| `hermes:power-battery:get` | `main.ts` | `getOnBattery` | removed (member stubbed) |
| `hermes:preview-guest-hidden` | `main.ts` | `setPreviewGuestHidden` | removed (member stubbed) |
| `hermes:preview:reach` | `main.ts` | `reachPreviewUrl` | removed (member stubbed) |
| `hermes:previewShortcutActive` | `main.ts` | `setPreviewShortcutActive` | removed (member stubbed) |
| `hermes:profile:default:get` | `main.ts` | `profile.getDefault` | replaced: local |
| `hermes:profile:default:set` | `main.ts` | `profile.setDefault` | removed (member stubbed) |
| `hermes:profile:get` | `main.ts` | `profile.get` | replaced: local |
| `hermes:profile:remember` | `main.ts` | `profile.remember` | replaced: local |
| `hermes:profile:set` | `main.ts` | `profile.set` | replaced: local |
| `hermes:quick-entry:ack` | `main.ts` | `quickEntry.ackSubmit` | removed (member stubbed) |
| `hermes:quick-entry:dismiss` | `main.ts` | `quickEntry.dismiss` | removed (member stubbed) |
| `hermes:quick-entry:settings:get` | `main.ts` | `quickEntry.getSettings` | removed (member stubbed) |
| `hermes:quick-entry:settings:set` | `main.ts` | `quickEntry.setSettings` | removed (member stubbed) |
| `hermes:quick-entry:state` | `main.ts` | `quickEntry.pushState`, `quickEntry.onState` | removed (member stubbed) |
| `hermes:quick-entry:submit` | `main.ts` | `quickEntry.submit`, `quickEntry.onSubmit` | removed (member stubbed) |
| `hermes:readClipboard` | `main.ts` | `readClipboard` | replaced: vanta:readClipboard |
| `hermes:readFileDataUrl` | `main.ts` | `readFileDataUrl` | removed (member stubbed) |
| `hermes:readFileDataUrlForAttach` | `main.ts` | `readFileDataUrlForAttach` | removed (member stubbed) |
| `hermes:readFileText` | `main.ts` | `readFileText` | removed (member stubbed) |
| `hermes:readPluginSource` | `main.ts` | `readPluginSource` | removed (member stubbed) |
| `hermes:requestMicrophoneAccess` | `main.ts` | `requestMicrophoneAccess` | removed (member stubbed) |
| `hermes:resolveFavicon` | `main.ts` | `resolveFavicon` | removed (member stubbed) |
| `hermes:saveClipboardImage` | `main.ts` | `saveClipboardImage` | removed (member stubbed) |
| `hermes:saveGatewayFile` | `main.ts` | `saveGatewayFile` | removed (member stubbed) |
| `hermes:saveImageBuffer` | `main.ts` | `saveImageBuffer` | removed (member stubbed) |
| `hermes:saveImageFromUrl` | `main.ts` | `saveImageFromUrl` | removed (member stubbed) |
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
| `hermes:stop-find-in-page` | `main.ts` | `stopFindInPage` | removed (member stubbed) |
| `hermes:stopPreviewFileWatch` | `main.ts` | `stopPreviewFileWatch` | removed (member stubbed) |
| `hermes:sync-status` | `main.ts` | (none) | removed (main-internal, no renderer member) |
| `hermes:terminal:attach` | `terminal-ipc.ts` | `terminal.attach` | removed (member stubbed) |
| `hermes:terminal:cwd` | `terminal-ipc.ts` | `terminal.cwd` | removed (member stubbed) |
| `hermes:terminal:dispose` | `terminal-ipc.ts` | `terminal.dispose` | removed (member stubbed) |
| `hermes:terminal:resize` | `terminal-ipc.ts` | `terminal.resize` | removed (member stubbed) |
| `hermes:terminal:start` | `terminal-ipc.ts` | `terminal.start` | removed (member stubbed) |
| `hermes:terminal:write` | `terminal-ipc.ts` | `terminal.write` | removed (member stubbed) |
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
| `hermes:watchDirectory` | `main.ts` | `watchDirectory` | removed (member stubbed) |
| `hermes:watchPreviewFile` | `main.ts` | `watchPreviewFile` | removed (member stubbed) |
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

`window.vantaDesktop` (Vanta-only): `pickProjectFolder`, `switchProjectForNewTask`, `readPendingProjectTask`, `acknowledgePendingProjectTask`,
`resolveDroppedFiles`, `pickAttachments`, `readClipboard`. Dropped from the old Vanta preload: `boundaryToken` (the renderer must never see it) and
`readSurfaceMode`/`setSurfaceMode`/`reportSurfacePhase`/`onSurfaceMode` (mini window and avatar, DN-10).

### D. Main to renderer push channels

Kept (7): `hermes:backend-exit` -> `vanta:backend-exit`, `hermes:boot-progress` -> `vanta:boot-progress`, `hermes:focus-session` -> `hermes:focus-session (module reused)`, `hermes:notification-action` -> `hermes:notification-action (module reused)`, `hermes:notification-activate` -> `hermes:notification-activate (module reused)`, `hermes:power-resume` -> `vanta:power-resume`, `hermes:window-state-changed` -> `vanta:window-state-changed`.

Removed (65): `hermes:active-work`, `hermes:bootstrap:event`, `hermes:browser-popout:closed`, `hermes:close-preview-requested`, `hermes:connection:active-route`, `hermes:connection:applied`, `hermes:connections:changed`, `hermes:context-menu-spellcheck`, `hermes:deep-link`, `hermes:devtools:disable-f12`, `hermes:external-open-failed`, `hermes:f12-shortcut`, `hermes:f12ShortcutActive`, `hermes:found-in-page`, `hermes:hud-modifier:status`, `hermes:hud:begin-move`, `hermes:hud:changed`, `hermes:hud:cursor`, `hermes:hud:end-move`, `hermes:hud:game-overlay`, `hermes:hud:goto`, `hermes:hud:ignore-mouse`, `hermes:hud:move-by`, `hermes:hud:session`, `hermes:hud:set-bounds`, `hermes:hud:workspace-transfer`, `hermes:keep-awake`, `hermes:logs:renderer-error`, `hermes:logs:renderer-line`, `hermes:minimize-to-tray:changed`, `hermes:native-theme`, `hermes:open-find-bar`, `hermes:open-folder-requested`, `hermes:open-updates`, `hermes:pet-overlay:control`, `hermes:pet-overlay:ignore-mouse`, `hermes:pet-overlay:set-bounds`, `hermes:pet-overlay:set-focusable`, `hermes:pet-overlay:state`, `hermes:pool:retiring`, `hermes:power-battery`, `hermes:preview-guest-hidden`, `hermes:preview-nav`, `hermes:previewShortcutActive`, `hermes:profile:default:changed`, `hermes:quick-entry:ack`, `hermes:quick-entry:dismiss`, `hermes:quick-entry:late-result`, `hermes:quick-entry:shown`, `hermes:quick-entry:state`, `hermes:quick-entry:submit`, `hermes:screenshot:request`, `hermes:screenshot:status`, `hermes:screenshot:subscribe`, `hermes:titlebar-theme`, `hermes:translucency`, `hermes:updates:metric:pending`, `hermes:updates:progress`, `hermes:wake-indicator:set`, `hermes:wake-indicator:state`, `hermes:window-control`, `hermes:window:relay`, `hermes:window:size`, `hermes:zoom:changed`, `hermes:zoom:set-percent`.

## 4. What was not verified

- The packaged app. The Vanta shell was run in real Electron 40.10.2 from a throwaway app folder with the bundled `electron-main.mjs` and `electron-preload.js`
  (see the DN-07 report), not from `electron-builder` output. Packaging the Vanta runtime (`vanta-ts`, Node dependencies, kernel binary) as an
  `extraResources` folder is not done; `VANTA_RUNTIME_ROOT` or `<resources>/vanta-runtime` is where the shell looks.
- `previewGuestPreload` is still emitted by the bundler and unused (`webviewTag` is off).
