import { BrowserWindow } from 'electron'

import { dotHtml, DOT_SIZE, type DotState } from './agent-dot-state'

export interface DotWindow {
  close: () => void
  setState: (state: DotState) => void
}

export interface DotWindowInit {
  onClick: () => void
  onMoved: (position: { x: number; y: number }) => void
  x: number
  y: number
}

/** The dot's window: small, frameless, transparent, above other windows, on every desktop. It loads only its own static page. */
export function openDotWindow(init: DotWindowInit): DotWindow {
  const win = new BrowserWindow({
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    frame: false,
    hasShadow: false,
    height: DOT_SIZE,
    maximizable: false,
    minimizable: false,
    resizable: false,
    show: false,
    skipTaskbar: true,
    title: 'Vanta',
    transparent: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    width: DOT_SIZE,
    x: init.x,
    y: init.y
  })

  win.setAlwaysOnTop(true, 'floating')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  win.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()

    if (url.startsWith('vanta-dot://click')) {
      init.onClick()
    }
  })

  win.on('moved', () => {
    const [x = init.x, y = init.y] = win.getPosition()
    init.onMoved({ x, y })
  })

  win.once('ready-to-show', () => win.showInactive())
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(dotHtml('idle'))}`)

  return {
    close: () => {
      if (!win.isDestroyed()) win.close()
    },
    setState: state => {
      if (!win.isDestroyed()) {
        void win.webContents.executeJavaScript(`window.__setState(${JSON.stringify(state)})`).catch(() => undefined)
      }
    }
  }
}
