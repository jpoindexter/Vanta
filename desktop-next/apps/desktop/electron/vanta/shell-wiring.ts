import path from 'node:path'

import { app, BrowserWindow, dialog, shell } from 'electron'

import { createExternalOpener } from './external-links'
import { registerFileActions } from './file-actions'
import { createGatedRunner } from './gated-run'
import { registerFsHandlers } from './fs-handlers'
import { registerGitHandlers } from './git-handlers'
import { registerGitMutations } from './git-mutation-handlers'
import { createGitRunner } from './git-runner'
import type { IpcLike } from './native-handlers'
import { createProjectGuard, type ProjectGuard } from './project-guard'
import type { FrameSink, RequestBridge } from './request-bridge'
import type { ServerHost } from './server-host'
import { registerShellExtras, type ShellExtras } from './shell-extras'
import { registerGatedTerminals } from './terminal-gated'
import { registerWindowFeatures, type WindowFeatures } from './window-features'
import { rendererLocation } from './window-host'

/** How a native feature asks the Vanta server to run a command, and which chat shows the approval card. */
interface ApprovalLinks {
  clientFor: (sender: unknown) => string | undefined
  run: ReturnType<typeof createGatedRunner>
}

export interface WiringContext {
  devServer?: string
  getMainWindow: () => BrowserWindow | null
  getProjectRoot: () => string
  /** Create and show the main window. */
  openMain: () => void
  windowFor: (sender: unknown) => BrowserWindow | null
}

/** Rename, Trash and Save image: each waits for a native dialog the page cannot answer for itself. */
function registerNativeConfirmations(guard: ProjectGuard, ipc: IpcLike): void {
  registerFileActions({
    confirm: async (sender, options) => {
      const owner = BrowserWindow.fromWebContents(sender as Electron.WebContents)
      const dialogOptions = { ...options, cancelId: 1, defaultId: 1, noLink: true, type: 'question' as const }
      const answer = owner ? await dialog.showMessageBox(owner, dialogOptions) : await dialog.showMessageBox(dialogOptions)

      return answer.response === 0
    },
    getRoot: () => guard.rootReal(),
    guard,
    ipc,
    pickSavePath: async (sender, defaultName) => {
      const owner = BrowserWindow.fromWebContents(sender as Electron.WebContents)
      const options = { defaultPath: path.join(app.getPath('downloads'), defaultName), title: 'Save image' }
      const picked = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options)

      return picked.canceled ? null : (picked.filePath ?? null)
    },
    trash: target => shell.trashItem(target)
  })
}

function registerProjectReaders(ctx: WiringContext, ipc: IpcLike, links: ApprovalLinks): () => void {
  const guard = createProjectGuard({
    deniedRoots: () => [process.env.VANTA_HOME ?? path.join(app.getPath('home'), '.vanta'), app.getPath('userData')],
    root: ctx.getProjectRoot
  })

  const git = createGitRunner()
  const watches = registerFsHandlers({ guard, ipc })

  registerGitHandlers({ git, guard, ipc })
  registerNativeConfirmations(guard, ipc)
  // Changes to a repository go through the same approval flow as the terminal, one command at a time.
  registerGitMutations({ clientFor: links.clientFor, git, guard, ipc, run: links.run })

  return watches.closeAll
}

/** Terminal panes run each typed line through the server's gated terminal route. */
function registerTerminals(ctx: WiringContext, ipc: IpcLike, links: ApprovalLinks): void {
  registerGatedTerminals({
    clientFor: sink => links.clientFor(sink),
    ipc,
    projectName: () => path.basename(ctx.getProjectRoot()) || 'project',
    projectRoot: ctx.getProjectRoot,
    run: links.run
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
      const links: ApprovalLinks = {
        clientFor: sender => requests.latestClientFor(sender as FrameSink),
        run: createGatedRunner(serverHost.transport)
      }

      closeProjectWatches = registerProjectReaders(ctx, ipc, links)
      registerTerminals(ctx, ipc, links)
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
