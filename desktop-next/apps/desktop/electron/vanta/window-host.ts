import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { BrowserWindow, nativeTheme, powerMonitor, type BrowserWindowConstructorOptions } from 'electron'

import { nativeOverlayWidth, titleBarOverlayOptions } from '../titlebar-overlay-width'
import { customWindowControlsEnabled, performWindowControl } from '../window-controls'

import { CH } from './channels'
import type { IpcLike } from './native-handlers'
import type { ConnectionDescriptor } from './shell-state'
import { BRIDGE_PLACEHOLDER_TOKEN, LOCAL_GATEWAY_URL } from './shell-state'

const IS_MAC = process.platform === 'darwin'
const TITLEBAR_HEIGHT = 34
const TRAFFIC_LIGHT_HEIGHT = 14
export const MAC_BUTTON_POSITION = { x: 24, y: TITLEBAR_HEIGHT / 2 - TRAFFIC_LIGHT_HEIGHT / 2 }
const MIN_WIDTH = 760
const MIN_HEIGHT = 560

export interface WindowHostOptions {
  /** Absolute path of the compiled preload script. */
  preloadPath: string
}

/** Security posture shared by every window: isolated, sandboxed, no Node, no webview. */
export function secureWebPreferences(
  preloadPath: string
): NonNullable<BrowserWindowConstructorOptions['webPreferences']> {
  return { contextIsolation: true, nodeIntegration: false, preload: preloadPath, sandbox: true, webviewTag: false }
}

export function createMainWindow(options: WindowHostOptions): BrowserWindow {
  const window = new BrowserWindow({
    backgroundColor: '#ffffff',
    height: 900,
    minHeight: MIN_HEIGHT,
    minWidth: MIN_WIDTH,
    show: false,
    title: 'Vanta',
    titleBarStyle: 'hidden',
    ...(IS_MAC
      ? { trafficLightPosition: MAC_BUTTON_POSITION }
      : {
          titleBarOverlay: titleBarOverlayOptions({
            dark: nativeTheme.shouldUseDarkColors,
            platform: process.platform === 'win32' ? 'windows' : 'linux',
            titlebarHeight: TITLEBAR_HEIGHT
          })
        }),
    webPreferences: secureWebPreferences(options.preloadPath),
    width: 1440
  })

  window.once('ready-to-show', () => window.show())

  return window
}

/** Only the app's own renderer may be in this window; everything else opens in the OS browser or is refused. */
export function lockNavigation(
  window: BrowserWindow,
  rendererOrigin: (url: string) => boolean,
  openExternal: (url: string) => void
): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) {
      openExternal(url)
    }

    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (!rendererOrigin(url)) {
      event.preventDefault()
    }
  })
}

export function windowState(window: BrowserWindow | null) {
  return {
    customWindowControls: customWindowControlsEnabled(),
    darwinMajor: 0,
    isFullscreen: Boolean(window?.isFullScreen()),
    isMaximized: Boolean(window?.isMaximized()),
    isMinimized: Boolean(window?.isMinimized()),
    isVisible: Boolean(window?.isVisible()),
    nativeOverlayWidth: nativeOverlayWidth({ isMac: IS_MAC, isWindows: process.platform === 'win32' }),
    windowButtonPosition: IS_MAC && !window?.isFullScreen() ? MAC_BUTTON_POSITION : null
  }
}

export function connectionDescriptor(baseUrl: string, window: BrowserWindow | null): ConnectionDescriptor {
  const state = windowState(window)

  return {
    baseUrl,
    customWindowControls: state.customWindowControls,
    darwinMajor: state.darwinMajor,
    isFullscreen: state.isFullscreen,
    isMaximized: state.isMaximized,
    logs: [],
    mode: 'local',
    nativeOverlayWidth: state.nativeOverlayWidth,
    source: 'local',
    token: BRIDGE_PLACEHOLDER_TOKEN,
    windowButtonPosition: state.windowButtonPosition,
    wsUrl: LOCAL_GATEWAY_URL
  }
}

/** Window controls, window-state pushes, native theme and power-resume. */
export function registerWindowHandlers(ipc: IpcLike, getWindow: (sender: unknown) => BrowserWindow | null): void {
  ipc.on(CH.windowControl, (event, action: unknown) => {
    performWindowControl(getWindow(event.sender), String(action))
  })

  ipc.on(CH.nativeTheme, (_event, mode: unknown) => {
    if (mode === 'light' || mode === 'dark' || mode === 'system') {
      nativeTheme.themeSource = mode
    }
  })

  ipc.on(CH.titlebarTheme, (event, payload: unknown) => {
    const window = getWindow(event.sender)
    const { color, symbolColor } = (payload && typeof payload === 'object' ? payload : {}) as {
      color?: unknown
      symbolColor?: unknown
    }

    if (!IS_MAC && window && typeof color === 'string' && typeof symbolColor === 'string') {
      window.setTitleBarOverlay({ color, height: TITLEBAR_HEIGHT, symbolColor })
    }
  })
}

export function wireWindowEvents(window: BrowserWindow): void {
  const push = () => {
    if (!window.isDestroyed()) {
      window.webContents.send(CH.windowState, windowState(window))
    }
  }

  window.on('maximize', push)
  window.on('unmaximize', push)
  window.on('enter-full-screen', push)
  window.on('leave-full-screen', push)
  window.on('minimize', push)
  window.on('restore', push)
  window.on('show', push)
  window.on('hide', push)

  powerMonitor.on('resume', () => {
    if (!window.isDestroyed()) {
      window.webContents.send(CH.powerResume)
    }
  })
}

export function rendererLocation(
  devServer: string | undefined,
  appRoot: string
): { isRenderer: (url: string) => boolean; url: string } {
  if (devServer) {
    const origin = new URL(devServer).origin

    return { isRenderer: url => sameOrigin(url, origin), url: devServer }
  }

  const index = path.join(appRoot, 'dist', 'index.html')

  return { isRenderer: url => url.startsWith('file:'), url: pathToFileURL(index).toString() }
}

function sameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin
  } catch {
    return false
  }
}
