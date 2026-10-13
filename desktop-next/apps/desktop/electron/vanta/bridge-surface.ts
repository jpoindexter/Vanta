import { type IpcRendererLike, mergeSurface, stubsFrom, subscribe } from './bridge-core'
import { gitApi, projectFileApi } from './bridge-native'
import { windowFeatureApi } from './bridge-window'
import { createApiProxy, createVantaBridge } from './bridge-vanta'
import { CH } from './channels'
import { SURFACE_MANIFEST } from './surface-manifest'
import { LOCAL_GATEWAY_URL } from './shell-state'

export interface BridgeEnv {
  customWindowControls: boolean
  ipc: IpcRendererLike
  pathForFile: (file: unknown) => string
  zoom: { factor: () => number; level: () => number; set: (factor: number) => void }
}

const ZOOM_MIN = 0.5
const ZOOM_MAX = 3

const IDLE_BOOTSTRAP = {
  active: false,
  bundled: false,
  completedAt: null,
  error: null,
  log: [],
  manifest: null,
  setupChoice: null,
  stages: {},
  startedAt: null,
  unsupportedPlatform: null
}

const SINGLE_LOCAL_REGISTRY = {
  connections: [],
  primary: 'local',
  secureTokenStorage: false,
  version: 1
}

function windowAndTheme({ customWindowControls, ipc }: BridgeEnv) {
  const control = (action: string) => () => ipc.send(CH.windowControl, action)

  return {
    onPowerResume: (callback: () => void) => subscribe(ipc, CH.powerResume, callback),
    onWindowStateChanged: (callback: (state: unknown) => void) => subscribe(ipc, CH.windowState, callback),
    setNativeTheme: (mode: string) => ipc.send(CH.nativeTheme, mode),
    setTitleBarTheme: (payload: unknown) => ipc.send(CH.titlebarTheme, payload),
    windowControls: {
      close: control('close'),
      custom: customWindowControls,
      minimize: control('minimize'),
      toggleMaximize: control('toggle-maximize')
    }
  }
}

function zoomApi({ ipc, zoom }: BridgeEnv) {
  const listeners = new Set<(payload: { level: number; percent: number }) => void>()
  const read = () => ({ level: zoom.level(), percent: Math.round(zoom.factor() * 100) })
  const notify = () => listeners.forEach(listener => listener(read()))

  // The View menu and the restore-on-load path change zoom in the main process; the settings control follows them.
  subscribe(ipc, CH.zoomChanged, notify)

  return {
    zoom: {
      factor: () => zoom.factor(),
      get: () => Promise.resolve(read()),
      onChanged: (callback: (payload: { level: number; percent: number }) => void) => {
        listeners.add(callback)

        return () => listeners.delete(callback)
      },
      setPercent: (percent: number) => {
        const factor = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(percent) / 100))

        zoom.set(factor)
        // Main saves the level so the next launch opens at the same size.
        ipc.send(CH.zoomPersist, Math.round(factor * 100))
        notify()
      }
    }
  }
}

function connectionAndBoot({ ipc }: BridgeEnv) {
  const describe = () => ipc.invoke(CH.connection)

  return {
    api: createApiProxy(ipc),
    continueBootstrapLocal: () => Promise.resolve({ ok: true }),
    getBootProgress: () => ipc.invoke(CH.bootProgressGet),
    getBootstrapState: () => Promise.resolve(IDLE_BOOTSTRAP),
    getConnection: describe,
    getConnectionFor: describe,
    getGatewayWsUrl: () => Promise.resolve(LOCAL_GATEWAY_URL),
    getGatewayWsUrlFor: () => Promise.resolve(LOCAL_GATEWAY_URL),
    onBackendExit: (callback: (payload: unknown) => void) => subscribe(ipc, CH.backendExit, callback),
    onBootProgress: (callback: (payload: unknown) => void) => subscribe(ipc, CH.bootProgress, callback),
    probeLocalBackend: () => Promise.resolve({ bootstrapNeeded: false }),
    revalidateConnection: () => Promise.resolve({ ok: true, rebuilt: false })
  }
}

function nativeAndProject({ ipc, pathForFile }: BridgeEnv) {
  return {
    getMachineProfile: () => ipc.invoke(CH.machineProfile),
    getPathForFile: (file: unknown) => {
      try {
        return pathForFile(file) || ''
      } catch {
        return ''
      }
    },
    getRecentLogs: () => ipc.invoke(CH.logsRecent),
    getVersion: () => ipc.invoke(CH.version),
    logLine: (line: string) => ipc.send(CH.logRendererLine, line),
    notify: (payload: unknown) => ipc.invoke(CH.notify, payload),
    onFocusSession: (callback: (sessionId: string) => void) => subscribe(ipc, CH.focusSession, callback),
    onNotificationAction: (callback: (payload: unknown) => void) => subscribe(ipc, CH.notificationAction, callback),
    onNotificationActivate: (callback: (payload: unknown) => void) => subscribe(ipc, CH.notificationActivate, callback),
    openDir: (dir: string) => ipc.invoke(CH.openDir, dir),
    openExternal: (url: string) => ipc.invoke(CH.openExternal, url),
    readClipboard: () => ipc.invoke(CH.readClipboard),
    reportRendererError: (report: unknown) => ipc.send(CH.logRendererError, report),
    revealLogs: () => ipc.invoke(CH.logsReveal),
    revealPath: (target: string) => ipc.invoke(CH.revealPath, target),
    sanitizeWorkspaceCwd: (cwd: string) => ipc.invoke(CH.sanitizeCwd, cwd),
    selectPaths: (options?: unknown) => ipc.invoke(CH.selectPaths, options),
    settings: {
      getDefaultProjectDir: () => ipc.invoke(CH.projectGetDefault),
      pickDefaultProjectDir: () => ipc.invoke(CH.projectPickDefault),
      setDefaultProjectDir: (dir: null | string) => ipc.invoke(CH.projectSetDefault, dir)
    },
    writeClipboard: (text: string) => ipc.invoke(CH.writeClipboard, text)
  }
}

/** One local connection and one profile: Vanta has neither a registry of backends nor named profiles. */
function singleEntryRegistries() {
  return {
    connections: { list: () => Promise.resolve(SINGLE_LOCAL_REGISTRY) },
    profile: {
      get: () => Promise.resolve({ profile: null }),
      getDefault: () => Promise.resolve(null),
      remember: () => Promise.resolve({ profile: null }),
      set: () => Promise.resolve({ profile: null })
    }
  }
}

export function buildImplemented(env: BridgeEnv): Record<string, unknown> {
  return {
    ...connectionAndBoot(env),
    ...gitApi(env.ipc),
    ...projectFileApi(env.ipc),
    ...windowFeatureApi(env.ipc),
    ...nativeAndProject(env),
    ...singleEntryRegistries(),
    ...windowAndTheme(env),
    ...zoomApi(env),
    vanta: createVantaBridge(env.ipc)
  }
}

/** `window.hermesDesktop`: the Hermes member names the renderer already calls, real where slice 1 needs them, typed-unsupported elsewhere. */
export function buildHermesDesktop(env: BridgeEnv): Record<string, unknown> {
  return mergeSurface(stubsFrom(SURFACE_MANIFEST), buildImplemented(env))
}

/** `window.vantaDesktop`: Vanta-only members. The boundary token is deliberately absent; main holds it. */
export function buildVantaDesktop({ ipc, pathForFile }: BridgeEnv): Record<string, unknown> {
  return Object.freeze({
    acknowledgePendingProjectTask: (id: string) => ipc.invoke(CH.acknowledgePendingProjectTask, id),
    pickAttachments: () => ipc.invoke(CH.pickAttachments),
    pickProjectFolder: (currentPath?: string) => ipc.invoke(CH.pickProjectFolder, currentPath),
    readClipboard: () => ipc.invoke(CH.readClipboardRich),
    readPendingProjectTask: () => ipc.invoke(CH.readPendingProjectTask),
    resolveDroppedFiles: (files: Iterable<unknown>) =>
      ipc.invoke(CH.resolveDroppedPaths, Array.from(files ?? [], file => pathForFile(file)).filter(Boolean)),
    switchProjectForNewTask: (draft: unknown) => ipc.invoke(CH.switchProjectForNewTask, draft)
  })
}
