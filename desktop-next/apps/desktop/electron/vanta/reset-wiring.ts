import path from 'node:path'

import { app, session, shell } from 'electron'

import type { IpcLike } from './native-handlers'
import { registerResetHandlers } from './reset-app'
import type { ServerHost } from './server-host'

export interface ResetWiringInput {
  ipc: IpcLike
  log: (line: string) => void
  /** Starts the runtime again in the current project; used when a reset stops part-way. */
  restartRuntime: () => Promise<void>
  serverHost: ServerHost
}

/** Connects the reset calls to the real app: folders, the Trash, window storage and relaunch. */
export function wireReset({ ipc, log, restartRuntime, serverHost }: ResetWiringInput): void {
  registerResetHandlers({
    clearStorage: () => session.defaultSession.clearStorageData(),
    home: app.getPath('home'),
    ipc,
    log,
    relaunch: () => {
      app.relaunch()
      app.exit(0)
    },
    restartRuntime,
    stopRuntime: () => serverHost.stop(),
    trash: target => shell.trashItem(target),
    userData: app.getPath('userData'),
    vantaHome: path.resolve(process.env.VANTA_HOME ?? path.join(app.getPath('home'), '.vanta'))
  })
}
