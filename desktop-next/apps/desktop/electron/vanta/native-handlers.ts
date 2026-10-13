import type { BrowserWindow, Dialog, Shell } from 'electron'

import { CH } from './channels'
import { dialogOptionsFor, existingAbsolutePath, parseExternalUrl } from './paths-policy'

export interface IpcLike {
  handle: (channel: string, listener: (event: { sender: unknown }, ...args: never[]) => unknown) => void
  on: (channel: string, listener: (event: { sender: unknown }, ...args: never[]) => void) => void
}

export interface NativeDeps {
  clipboard: {
    readImage: () => { isEmpty: () => boolean; toPNG: () => Buffer }
    readText: () => string
    writeText: (text: string) => void
  }
  dialog: Pick<Dialog, 'showOpenDialog'>
  getWindow: (sender: unknown) => BrowserWindow | null
  ipc: IpcLike
  log: (line: string) => void
  projectRoot: () => string
  shell: Pick<Shell, 'openExternal' | 'openPath' | 'showItemInFolder'>
}

const MAX_CLIPBOARD_CHARS = 1_000_000
const MAX_LOG_LINE = 2000

function registerLinkAndPathHandlers({ ipc, shell }: NativeDeps): void {
  ipc.handle(CH.openExternal, async (_event, raw: unknown) => {
    const url = parseExternalUrl(raw)

    if (!url) {
      return { ok: false, reason: 'invalid' }
    }

    try {
      await shell.openExternal(url.toString())

      return { ok: true }
    } catch (error) {
      return { message: error instanceof Error ? error.message : String(error), ok: false, reason: 'failed' }
    }
  })

  // showItemInFolder only selects the item in the file manager; it never opens or runs it.
  ipc.handle(CH.revealPath, async (_event, raw: unknown) => {
    const target = await existingAbsolutePath(raw)

    if (target) {
      shell.showItemInFolder(target.path)
    }

    return Boolean(target)
  })

  // shell.openPath EXECUTES a file, so only a directory is ever passed to it.
  ipc.handle(CH.openDir, async (_event, raw: unknown) => {
    const target = await existingAbsolutePath(raw)

    if (!target?.isDirectory) {
      return { error: 'Not a directory on this machine.', ok: false }
    }

    const failure = await shell.openPath(target.path)

    return failure ? { error: failure, ok: false } : { ok: true }
  })
}

function registerPickerHandlers(deps: NativeDeps): void {
  const { dialog, ipc } = deps

  ipc.handle(CH.selectPaths, async (event, raw: unknown) => {
    const window = deps.getWindow(event.sender)
    const chosen = dialogOptionsFor(raw)
    const options = { ...chosen, properties: chosen.properties ?? ['openFile'] }
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)

    return result.canceled ? [] : result.filePaths
  })

  ipc.handle(CH.sanitizeCwd, async (_event, raw: unknown) => {
    const target = await existingAbsolutePath(raw)

    return target?.isDirectory ? target.path : deps.projectRoot()
  })
}

function registerClipboardHandlers({ clipboard, ipc }: NativeDeps): void {
  ipc.handle(CH.readClipboard, () => clipboard.readText().slice(0, MAX_CLIPBOARD_CHARS))

  // Text plus an optional PNG, for pasting a screenshot into the composer.
  ipc.handle(CH.readClipboardRich, () => {
    const image = clipboard.readImage()
    const png = image.isEmpty() ? null : image.toPNG()

    return {
      text: clipboard.readText().slice(0, MAX_CLIPBOARD_CHARS),
      ...(png?.length ? { image: { bytes: png.length, dataBase64: png.toString('base64'), mime: 'image/png' } } : {})
    }
  })

  ipc.handle(CH.writeClipboard, (_event, text: unknown) => {
    if (typeof text !== 'string') {
      return false
    }

    clipboard.writeText(text.slice(0, MAX_CLIPBOARD_CHARS))

    return true
  })
}

function registerLogHandlers({ ipc, log }: NativeDeps): void {
  ipc.on(CH.logRendererLine, (_event, line: unknown) => {
    if (typeof line === 'string') {
      log(`[renderer] ${line.slice(0, MAX_LOG_LINE)}`)
    }
  })

  ipc.on(CH.logRendererError, (_event, report: unknown) => {
    if (report && typeof report === 'object') {
      const { boundary, label, message } = report as Record<string, unknown>
      log(
        `[renderer-error] ${String(label ?? '')} ${String(boundary ?? '')}: ${String(message ?? '').slice(0, MAX_LOG_LINE)}`
      )
    }
  })
}

/**
 * The small set of OS-touching handlers slice 1 needs. Each validates its input here because the
 * renderer is not trusted with the OS: no handler reads file contents, executes anything, or opens
 * a path it has not checked.
 */
export function registerNativeHandlers(deps: NativeDeps): void {
  registerLinkAndPathHandlers(deps)
  registerPickerHandlers(deps)
  registerClipboardHandlers(deps)
  registerLogHandlers(deps)
}
