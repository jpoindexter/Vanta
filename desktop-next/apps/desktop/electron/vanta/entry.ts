import path from 'node:path'

import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'

import { resolveProjectRoot, saveProjectSetting } from '../../../../../vanta-ts/desktop-app/electron/project-root.mjs'
import { registerMachineProfile } from '../machine-profile'
import { registerNativeNotifications } from '../notification-ipc'

import { createAppLog } from './app-log'
import { CH } from './channels'
import { deepLinkFromArgv } from './deep-links'
import { type LaunchInput, startVantaServer } from './launcher'
import { registerNativeHandlers } from './native-handlers'
import { registerProjectHandlers } from './project-handlers'
import { createRequestBridge } from './request-bridge'
import { resolveRuntimeRoot } from './runtime-root'
import { ServerHost } from './server-host'
import { registerShellHandlers } from './shell-handlers'
import { createBootTracker } from './shell-state'
import { createShellWiring } from './shell-wiring'
import { listenForDeepLinks } from './window-features'
import {
  connectionDescriptor,
  createMainWindow,
  lockNavigation,
  registerWindowHandlers,
  rendererLocation,
  wireWindowEvents
} from './window-host'

app.setName('Vanta Next')

const DEV_SERVER = process.env.VANTA_DESKTOP_DEV_SERVER ?? process.env.HERMES_DESKTOP_DEV_SERVER
const argv = process.argv.slice(app.isPackaged ? 1 : 2)

let mainWindow: BrowserWindow | null = null
let projectRoot = ''
let shuttingDown = false
let host: ServerHost | null = null

const wiring = createShellWiring({
  devServer: DEV_SERVER,
  getMainWindow: () => mainWindow,
  getProjectRoot: () => projectRoot,
  openMain: () => openWindow(),
  windowFor: sender => windowFor(sender)
})
let logLine: (line: string) => void = () => undefined

const windowFor = (sender: unknown): BrowserWindow | null =>
  BrowserWindow.fromWebContents(sender as Electron.WebContents)

/** Where the Vanta runtime lives: `<repo>/vanta-ts` in a checkout, `Resources/vanta-runtime` packaged, VANTA_RUNTIME_ROOT either way. */
function runtimeRoot(): string {
  return resolveRuntimeRoot({
    appPath: app.getAppPath(),
    env: process.env,
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath
  })
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
  wiring.closeProjectWatches()
  projectRoot = root
  await serverHost.start(launchInput(root)).catch(() => undefined)
  mainWindow?.webContents.reload()
}

/** A native question the renderer cannot script: may the agent's workspace move to this folder? */
async function askToSwitchProject(dir: string): Promise<boolean> {
  const options = {
    buttons: ['Switch project', 'Cancel'],
    cancelId: 1,
    defaultId: 1,
    detail: dir,
    message: 'Let Vanta work in this folder?',
    type: 'question' as const
  }

  const answer = mainWindow ? await dialog.showMessageBox(mainWindow, options) : await dialog.showMessageBox(options)

  return answer.response === 0
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
  const requests = createRequestBridge(serverHost.transport, { closed: CH.eventsClosed, frame: CH.eventsFrame })

  wiring.registerAll(ipc, log.line, serverHost, requests)

  registerProjectHandlers({
    confirmSwitch: askToSwitchProject,
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
    requests,
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
    wiring.openExternalLink
  )
  wireWindowEvents(window)
  wiring.attachWindow(window)
  window.on('closed', () => {
    mainWindow = null
  })

  mainWindow = window
  void window.loadURL(location.url).catch(error => logLine(`[renderer] failed to load: ${String(error)}`))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  listenForDeepLinks(wiring.routeDeepLink)

  app.on('second-instance', (_event, commandLine) => {
    const link = deepLinkFromArgv(commandLine)

    mainWindow?.show()
    mainWindow?.focus()

    if (link) {
      wiring.routeDeepLink(link)
    }
  })

  let quitTeardown: 'done' | 'pending' | 'running' = 'pending'

  // Hold the quit until the runtime, its kernel guard and the kernel are gone: nothing may outlive the app.
  app.on('before-quit', event => {
    shuttingDown = true

    if (quitTeardown === 'done' || !host) {
      return
    }

    event.preventDefault()

    if (quitTeardown === 'running') {
      return
    }

    quitTeardown = 'running'
    void host.stopAndWait().finally(() => {
      quitTeardown = 'done'
      app.quit()
    })
  })

  // Last resort for exits that skip before-quit; the runtime also ends on its own when this process is gone.
  process.on('exit', () => host?.stop())

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => app.quit())
  }

  app.on('window-all-closed', () => {
    // The tray keeps Vanta, and the agent in it, running with no window open; macOS always does.
    if (shuttingDown || (process.platform !== 'darwin' && !wiring.keepRunningWithoutWindows())) {
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
