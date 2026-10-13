import path from 'node:path'

import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'

import { resolveProjectRoot, saveProjectSetting } from '../../../../../vanta-ts/desktop-app/electron/project-root.mjs'
import { registerMachineProfile } from '../machine-profile'
import { registerNativeNotifications } from '../notification-ipc'

import { createAppLog } from './app-log'
import { CH } from './channels'
import { type LaunchInput, startVantaServer } from './launcher'
import { registerNativeHandlers } from './native-handlers'
import { registerProjectHandlers } from './project-handlers'
import { createRequestBridge } from './request-bridge'
import { ServerHost } from './server-host'
import { registerShellHandlers } from './shell-handlers'
import { createBootTracker } from './shell-state'
import {
  connectionDescriptor,
  createMainWindow,
  lockNavigation,
  registerWindowHandlers,
  rendererLocation,
  wireWindowEvents
} from './window-host'

app.setName('Vanta')

const DEV_SERVER = process.env.VANTA_DESKTOP_DEV_SERVER ?? process.env.HERMES_DESKTOP_DEV_SERVER
const argv = process.argv.slice(app.isPackaged ? 1 : 2)

let mainWindow: BrowserWindow | null = null
let projectRoot = ''
let shuttingDown = false
let host: ServerHost | null = null
let logLine: (line: string) => void = () => undefined

const windowFor = (sender: unknown): BrowserWindow | null =>
  BrowserWindow.fromWebContents(sender as Electron.WebContents)

/** Where the Vanta runtime (src/cli.ts, node_modules/tsx) lives: `<repo>/vanta-ts` in a checkout, a bundled resource when packaged. */
function runtimeRoot(): string {
  if (process.env.VANTA_RUNTIME_ROOT) {
    return process.env.VANTA_RUNTIME_ROOT
  }

  return app.isPackaged
    ? path.join(process.resourcesPath, 'vanta-runtime')
    : path.resolve(app.getAppPath(), '../../../vanta-ts')
}

function launchInput(root: string): LaunchInput {
  return {
    companion: process.env.VANTA_DESKTOP_COMPANION === '1',
    env: process.env,
    execPath: process.execPath,
    packaged: app.isPackaged,
    platform: process.platform,
    projectRoot: root,
    resourcesPath: process.resourcesPath,
    runtimeRoot: runtimeRoot()
  }
}

interface Services {
  boot: ReturnType<typeof createBootTracker>
  host: ServerHost
  log: ReturnType<typeof createAppLog>
}

function createServices(): Services {
  const log = createAppLog(path.join(app.getPath('userData'), 'logs'))
  logLine = log.line
  const broadcast = (channel: string, payload: unknown) => mainWindow?.webContents.send(channel, payload)
  const boot = createBootTracker(progress => broadcast(CH.bootProgress, progress))

  const serverHost = new ServerHost({
    boot,
    launch: startVantaServer,
    log: log.line,
    onUnexpectedExit: exit => broadcast(CH.backendExit, exit)
  })

  host = serverHost

  return { boot, host: serverHost, log }
}

/** Persist the project, restart the runtime in it, and reload the renderer so it reconnects. */
async function switchProject(root: string, serverHost: ServerHost): Promise<void> {
  await saveProjectSetting(app.getPath('userData'), root)
  projectRoot = root
  await serverHost.start(launchInput(root)).catch(() => undefined)
  mainWindow?.webContents.reload()
}

function registerHandlers({ boot, host: serverHost, log }: Services): void {
  const ipc = ipcMain as never

  registerNativeHandlers({
    clipboard,
    dialog,
    getWindow: windowFor,
    ipc,
    log: log.line,
    projectRoot: () => projectRoot,
    shell
  })
  registerWindowHandlers(ipc, windowFor)

  registerProjectHandlers({
    dialog: dialog as never,
    getWindow: windowFor,
    ipc,
    projectRoot: () => projectRoot,
    switchTo: root => switchProject(root, serverHost)
  })

  registerMachineProfile()

  registerNativeNotifications({
    focusWindow: window => {
      window.show()
      window.focus()
    },
    getMainWindow: () => mainWindow
  })

  registerShellHandlers({
    appVersion: () => app.getVersion(),
    baseUrl: () => serverHost.baseUrlWhenReady(),
    boot: boot.get,
    describe: connectionDescriptor,
    getWindow: windowFor,
    ipc,
    log,
    requests: createRequestBridge(serverHost.transport, { closed: CH.eventsClosed, frame: CH.eventsFrame }),
    reveal: file => shell.showItemInFolder(file)
  })
}

/** Register every IPC handler once, and start the Vanta runtime for the chosen project. */
async function startServices(): Promise<void> {
  const services = createServices()

  projectRoot = await resolveProjectRoot({
    args: argv,
    cwd: app.isPackaged ? app.getPath('home') : process.cwd(),
    env: process.env,
    userData: app.getPath('userData')
  })

  registerHandlers(services)
  void services.host.start(launchInput(projectRoot)).catch(() => undefined)
}

function openWindow(): void {
  const window = createMainWindow({ preloadPath: path.join(app.getAppPath(), 'dist', 'electron-preload.js') })
  const location = rendererLocation(DEV_SERVER, app.getAppPath())

  lockNavigation(
    window,
    url => location.isRenderer(url),
    url => void shell.openExternal(url)
  )
  wireWindowEvents(window)
  window.on('closed', () => {
    mainWindow = null
  })

  mainWindow = window
  void window.loadURL(location.url).catch(error => logLine(`[renderer] failed to load: ${String(error)}`))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  app.on('before-quit', () => {
    shuttingDown = true
    host?.stop()
  })

  // The runtime is a child process. However the shell ends (quit, signal, crash handler), do not leave it listening.
  process.on('exit', () => host?.stop())

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => app.quit())
  }

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' || shuttingDown) {
      app.quit()
    }
  })

  app.on('activate', () => {
    if (!mainWindow && host) {
      openWindow()
    }
  })

  app
    .whenReady()
    .then(async () => {
      await startServices()
      openWindow()
    })
    .catch(error => {
      console.error(error)
      app.exit(1)
    })
}
