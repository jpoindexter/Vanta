import path from 'node:path'

import { app, type BrowserWindow, shell } from 'electron'

import { createExternalOpener } from './external-links'
import { registerFsHandlers } from './fs-handlers'
import { registerGitHandlers } from './git-handlers'
import { createGitRunner } from './git-runner'
import type { IpcLike } from './native-handlers'
import { createProjectGuard } from './project-guard'
import type { RequestBridge } from './request-bridge'
import type { ServerHost } from './server-host'
import { registerShellExtras, type ShellExtras } from './shell-extras'
import { COMMAND_TIMEOUT_MS, registerGatedTerminals } from './terminal-gated'
import { registerWindowFeatures, type WindowFeatures } from './window-features'
import { rendererLocation } from './window-host'

export interface WiringContext {
  devServer?: string
  getMainWindow: () => BrowserWindow | null
  getProjectRoot: () => string
  /** Create and show the main window. */
  openMain: () => void
  windowFor: (sender: unknown) => BrowserWindow | null
}

function registerProjectReaders(ctx: WiringContext, ipc: IpcLike): () => void {
  const guard = createProjectGuard({
    deniedRoots: () => [process.env.VANTA_HOME ?? path.join(app.getPath('home'), '.vanta'), app.getPath('userData')],
    root: ctx.getProjectRoot
  })

  const watches = registerFsHandlers({ guard, ipc })

  registerGitHandlers({ git: createGitRunner(), guard, ipc })

  return watches.closeAll
}

/** Terminal panes run each typed line through the server's gated terminal route. */
function registerTerminals(ctx: WiringContext, ipc: IpcLike, serverHost: ServerHost, requests: RequestBridge): void {
  registerGatedTerminals({
    clientFor: sink => requests.latestClientFor(sink),
    ipc,
    projectName: () => path.basename(ctx.getProjectRoot()) || 'project',
    projectRoot: ctx.getProjectRoot,
    run: async (command, clientId) => {
      const result = await serverHost.transport.request({
        body: { command },
        clientId,
        method: 'POST',
        path: '/api/terminal',
        timeoutMs: COMMAND_TIMEOUT_MS
      })
      const data = result.data as { ok?: boolean; output?: unknown; error?: unknown } | null

      if (!result.ok) {
        return { ok: false, output: String(data?.error ?? `The Vanta server answered ${result.status || 'nothing'}.`) }
      }

      return { ok: data?.ok === true, output: typeof data?.output === 'string' ? data.output : '' }
    }
  })
}

function showMainWindow(ctx: WiringContext): void {
  const main = ctx.getMainWindow()

  if (main && !main.isDestroyed()) {
    main.isMinimized() && main.restore()
    main.show()
    main.focus()
  } else {
    ctx.openMain()
  }
}

function registerExtras(
  ctx: WiringContext,
  parts: { ipc: IpcLike; log: (line: string) => void; openExternal: (url: string) => void; serverHost: ServerHost }
): ShellExtras {
  const location = rendererLocation(ctx.devServer, app.getAppPath())

  return registerShellExtras({
    appRoot: app.getAppPath(),
    devServer: ctx.devServer,
    getMainWindow: ctx.getMainWindow,
    ipc: parts.ipc,
    isRenderer: url => location.isRenderer(url),
    log: parts.log,
    openExternal: parts.openExternal,
    showMain: () => showMainWindow(ctx),
    transport: parts.serverHost.transport
  })
}

/**
 * Registers the native capabilities that sit beside the Vanta server bridge: read-only project files and git,
 * the application menu, find, zoom, keep-awake, vanta:// links, the mini window, quick entry and the tray.
 * Kept out of entry.ts so the entry stays a lifecycle script.
 */
export function createShellWiring(ctx: WiringContext) {
  let features: WindowFeatures | null = null
  let extras: ShellExtras | null = null
  let closeProjectWatches: () => void = () => undefined
  const earlyLinks: string[] = []

  const openExternalLink = createExternalOpener({
    notify: (channel, payload) => ctx.getMainWindow()?.webContents.send(channel, payload),
    openExternal: url => shell.openExternal(url)
  })

  return {
    attachWindow: (window: BrowserWindow) => features?.attachWindow(window),
    /** Called when the project folder changes: file watches belong to the old folder. */
    closeProjectWatches: () => closeProjectWatches(),
    keepRunningWithoutWindows: () => Boolean(extras?.keepRunningWithoutWindows()),
    openExternalLink,
    /** A vanta:// link may arrive before the window features exist; hold it until they do. */
    routeDeepLink: (url: string): void => {
      features ? features.deepLinks.handleUrl(url) : earlyLinks.push(url)
    },
    registerAll: (ipc: IpcLike, log: (line: string) => void, serverHost: ServerHost, requests: RequestBridge): void => {
      closeProjectWatches = registerProjectReaders(ctx, ipc)
      registerTerminals(ctx, ipc, serverHost, requests)
      features = registerWindowFeatures({
        getMainWindow: ctx.getMainWindow,
        ipc,
        log,
        openExternal: openExternalLink,
        windowFor: ctx.windowFor
      })
      earlyLinks.splice(0).forEach(url => features?.deepLinks.handleUrl(url))
      extras = registerExtras(ctx, { ipc, log, openExternal: openExternalLink, serverHost })
    }
  }
}

export type ShellWiring = ReturnType<typeof createShellWiring>
