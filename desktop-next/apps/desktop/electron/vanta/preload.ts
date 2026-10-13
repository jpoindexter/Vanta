import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'

import { customWindowControlsEnabled } from '../window-controls'

import type { IpcRendererLike } from './bridge-core'
import { type BridgeEnv, buildHermesDesktop, buildVantaDesktop } from './bridge-surface'

// Nothing here may import node:fs/os/child_process: a sandboxed preload may only require
// electron, events, timers and url, and a throw at load takes the whole bridge down.
const env: BridgeEnv = {
  customWindowControls: customWindowControlsEnabled(),
  // ipcRenderer's listener signature is `any[]`; IpcRendererLike narrows it. One cast at the one seam.
  ipc: ipcRenderer as unknown as IpcRendererLike,
  pathForFile: file => webUtils.getPathForFile(file as File),
  zoom: {
    factor: () => webFrame.getZoomFactor(),
    level: () => webFrame.getZoomLevel(),
    set: factor => webFrame.setZoomFactor(factor)
  }
}

contextBridge.exposeInMainWorld('hermesDesktop', buildHermesDesktop(env))
contextBridge.exposeInMainWorld('vantaDesktop', buildVantaDesktop(env))
