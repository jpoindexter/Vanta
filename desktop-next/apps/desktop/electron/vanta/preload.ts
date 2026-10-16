import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'

import { customWindowControlsEnabled } from '../window-controls'

import type { IpcRendererLike } from './bridge-core'
import { DEFAULT_HUD_WINDOWING, type HudWindowingView } from './bridge-mini'
import { type BridgeEnv, buildDesktopBridge, buildVantaDesktop } from './bridge-surface'

// Nothing here may import node:fs/os/child_process: a sandboxed preload may only require
// electron, events, timers and url, and a throw at load takes the whole bridge down.
/** The OS-specific way the mini window can be moved, asked of the main process once, before the page loads. */
function hudWindowing(): HudWindowingView {
  try {
    const view = ipcRenderer.sendSync('desktop:hud:windowing') as Partial<HudWindowingView> | undefined

    return { ...DEFAULT_HUD_WINDOWING, ...(view ?? {}) }
  } catch {
    return DEFAULT_HUD_WINDOWING
  }
}

const env: BridgeEnv = {
  customWindowControls: customWindowControlsEnabled(),
  hudWindowing: hudWindowing(),
  // ipcRenderer's listener signature is `any[]`; IpcRendererLike narrows it. One cast at the one seam.
  ipc: ipcRenderer as unknown as IpcRendererLike,
  pathForFile: file => webUtils.getPathForFile(file as File),
  zoom: {
    factor: () => webFrame.getZoomFactor(),
    level: () => webFrame.getZoomLevel(),
    set: factor => webFrame.setZoomFactor(factor)
  }
}

contextBridge.exposeInMainWorld('desktopBridge', buildDesktopBridge(env))
contextBridge.exposeInMainWorld('vantaDesktop', buildVantaDesktop(env))
