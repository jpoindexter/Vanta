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
  /** Stops the runtime and starts it again for the current project (the crash toast's "Restart Vanta"). */
  restart: () => Promise<void>
}

interface Sender {
  id: number
  isDestroyed: () => boolean
  once: (event: 'destroyed', listener: () => void) => void
  send: (channel: string, ...args: unknown[]) => void
}

/** What the About page and the updates store read: the app version plus the runtime it runs on. */
export function versionInfo(appVersion: string, versions: NodeJS.ProcessVersions = process.versions, platform: string = process.platform) {
  return {
    appVersion,
    channel: null,
    distribution: 'desktop-app' as const,
    electronVersion: versions.electron ?? '',
    vantaRoot: '',
    nodeVersion: versions.node,
    platform,
    source: 'build' as const
  }
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

  ipc.on(CH.focusClient, (event, clientId: unknown) => requests.setFocusedClient(event.sender as Sender, clientId))

  ipc.handle(CH.connection, async event => deps.describe(await deps.baseUrl(), deps.getWindow(event.sender)))
  ipc.handle(CH.backendRecycle, async () => {
    await deps.restart()

    return { ok: true }
  })
  ipc.handle(CH.bootProgressGet, () => deps.boot())
  ipc.handle(CH.version, () => versionInfo(deps.appVersion()))
  ipc.handle(CH.logsRecent, () => ({ lines: deps.log.recent(), path: deps.log.file }))

  ipc.handle(CH.logsReveal, () => {
    deps.reveal(deps.log.file)

    return { ok: true, path: deps.log.file }
  })
}
