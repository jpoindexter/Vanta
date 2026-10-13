/**
 * Every IPC channel the Vanta shell registers, in one place so main, preload and the surface
 * document (docs/ipc-surface-2026-10-13.md) cannot drift apart.
 */
export const CH = {
  // Vanta server bridge
  request: 'vanta:request',
  eventsOpen: 'vanta:events:open',
  eventsClose: 'vanta:events:close',
  eventsFrame: 'vanta:events:frame',
  eventsClosed: 'vanta:events:closed',
  // Connection and boot
  connection: 'vanta:connection',
  bootProgressGet: 'vanta:boot-progress:get',
  bootProgress: 'vanta:boot-progress',
  backendExit: 'vanta:backend-exit',
  // Window
  windowControl: 'vanta:window-control',
  windowState: 'vanta:window-state-changed',
  titlebarTheme: 'vanta:titlebar-theme',
  nativeTheme: 'vanta:native-theme',
  zoomGet: 'vanta:zoom:get',
  zoomSet: 'vanta:zoom:set',
  zoomChanged: 'vanta:zoom:changed',
  powerResume: 'vanta:power-resume',
  // Native helpers
  openExternal: 'vanta:openExternal',
  revealPath: 'vanta:fs:reveal',
  openDir: 'vanta:fs:openDir',
  selectPaths: 'vanta:selectPaths',
  readClipboard: 'vanta:readClipboard',
  writeClipboard: 'vanta:writeClipboard',
  // Reused unchanged from the Hermes modules notification-ipc.ts and machine-profile.ts
  notify: 'hermes:notify',
  notificationAction: 'hermes:notification-action',
  notificationActivate: 'hermes:notification-activate',
  focusSession: 'hermes:focus-session',
  version: 'vanta:version',
  machineProfile: 'hermes:machine:profile',
  sanitizeCwd: 'vanta:workspace:sanitize',
  logsReveal: 'vanta:logs:reveal',
  logsRecent: 'vanta:logs:recent',
  logRendererError: 'vanta:logs:renderer-error',
  logRendererLine: 'vanta:logs:renderer-line',
  // Project
  projectGetDefault: 'vanta:project:get-default',
  projectPickDefault: 'vanta:project:pick-default',
  projectSetDefault: 'vanta:project:set-default',
  resolveDroppedPaths: 'vanta:resolve-dropped-paths',
  pickAttachments: 'vanta:pick-attachments',
  readClipboardRich: 'vanta:read-clipboard',
  pickProjectFolder: 'vanta:pick-project-folder',
  switchProjectForNewTask: 'vanta:switch-project-for-new-task',
  readPendingProjectTask: 'vanta:read-pending-project-task',
  acknowledgePendingProjectTask: 'vanta:acknowledge-pending-project-task',
  // Preload-time synchronous reads
  glassSupport: 'vanta:translucency:support'
} as const

export type Channel = (typeof CH)[keyof typeof CH]
