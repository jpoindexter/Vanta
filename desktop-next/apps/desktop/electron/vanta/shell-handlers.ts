import type { BrowserWindow } from 'electron'

import { CH } from './channels'
import type { IpcLike } from './native-handlers'
import type { RequestBridge } from './request-bridge'
import type { AppLog } from './app-log'
import type { BootProgress, ConnectionDescriptor } from './shell-state'

export interface ShellDeps {
  appVersion: () => string
  baseUrl: () => Promise<string>
  boot: () => BootProgress
  describe: (baseUrl: string, window: BrowserWindow | null) => ConnectionDescriptor
  getWindow: (sender: unknown) => BrowserWindow | null
  ipc: IpcLike
  log: AppLog
  reveal: (file: string) => void
  requests: RequestBridge
}

interface Sender {
  id: number
  isDestroyed: () => boolean
  once: (event: 'destroyed', listener: () => void) => void
  send: (channel: string, ...args: unknown[]) => void
}

/** The Vanta server bridge, connection and boot reads, version and logs. */
export function registerShellHandlers(deps: ShellDeps): void {
  const { ipc, requests } = deps

  ipc.handle(CH.request, (_event, call: unknown) => requests.request(call))

  ipc.on(CH.eventsOpen, (event, streamId: unknown, clientId: unknown) => {
    const sender = event.sender as Sender
    const opened = requests.openStream(sender, { clientId, streamId })

    if (!opened.ok) {
      sender.send(CH.eventsClosed, streamId, opened.reason ?? 'could not open the event stream')

      return
    }

    sender.once('destroyed', () => requests.closeAllFor(sender))
  })

  ipc.on(CH.eventsClose, (event, streamId: unknown) => {
    if (typeof streamId === 'string') {
      requests.closeStream(event.sender as Sender, streamId)
    }
  })

  ipc.handle(CH.connection, async event => deps.describe(await deps.baseUrl(), deps.getWindow(event.sender)))
  ipc.handle(CH.bootProgressGet, () => deps.boot())
  ipc.handle(CH.version, () => deps.appVersion())
  ipc.handle(CH.logsRecent, () => ({ lines: deps.log.recent(), path: deps.log.file }))

  ipc.handle(CH.logsReveal, () => {
    deps.reveal(deps.log.file)

    return { ok: true, path: deps.log.file }
  })
}
