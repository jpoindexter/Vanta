import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { CH } from './channels'
import { type IpcLike, type NativeDeps, registerNativeHandlers } from './native-handlers'

let root: string
let file: string

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'vanta-native-'))
  mkdirSync(path.join(root, 'project'))
  file = path.join(root, 'project', 'run.sh')
  writeFileSync(file, '#!/bin/sh\necho owned\n')
})

afterAll(() => rmSync(root, { force: true, recursive: true }))

function setup() {
  const handlers = new Map<string, (event: { sender: unknown }, ...args: unknown[]) => unknown>()
  const ipc = {
    handle: (channel, fn) => handlers.set(channel, fn as never),
    on: (channel, fn) => handlers.set(channel, fn as never)
  } as IpcLike
  const clipboardText = { value: '' }

  const deps = {
    clipboard: {
      readImage: () => ({ isEmpty: () => true, toPNG: () => Buffer.alloc(0) }),
      readText: () => clipboardText.value,
      writeText: (text: string) => {
        clipboardText.value = text
      }
    },
    dialog: { showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['/picked'] })) },
    getWindow: () => null,
    ipc,
    log: vi.fn(),
    projectRoot: () => path.join(root, 'project'),
    shell: { openExternal: vi.fn(async () => undefined), openPath: vi.fn(async () => ''), showItemInFolder: vi.fn() }
  } as unknown as NativeDeps

  registerNativeHandlers(deps)
  const call = (channel: string, ...args: unknown[]) => Promise.resolve(handlers.get(channel)!({ sender: {} }, ...args))

  return { call, clipboardText, deps }
}

describe('openExternal', () => {
  it('opens http(s) and mailto links in the OS', async () => {
    const { call, deps } = setup()

    await expect(call(CH.openExternal, 'https://example.com/x')).resolves.toEqual({ ok: true })
    expect(deps.shell.openExternal).toHaveBeenCalledWith('https://example.com/x')
  })

  it.each(['file:///etc/passwd', 'javascript:alert(1)', 'ssh://h', 42])(
    'refuses %j without calling the OS',
    async raw => {
      const { call, deps } = setup()

      await expect(call(CH.openExternal, raw)).resolves.toEqual({ ok: false, reason: 'invalid' })
      expect(deps.shell.openExternal).not.toHaveBeenCalled()
    }
  )

  it('reports an OS failure instead of throwing', async () => {
    const { call, deps } = setup()
    vi.mocked(deps.shell.openExternal).mockRejectedValueOnce(new Error('no handler'))

    await expect(call(CH.openExternal, 'https://example.com')).resolves.toEqual({
      message: 'no handler',
      ok: false,
      reason: 'failed'
    })
  })
})

describe('openDir and revealPath: never execute', () => {
  it('opens a directory but refuses a file, so a script can never be launched through it', async () => {
    const { call, deps } = setup()

    await expect(call(CH.openDir, path.join(root, 'project'))).resolves.toEqual({ ok: true })
    await expect(call(CH.openDir, file)).resolves.toMatchObject({ ok: false })
    expect(deps.shell.openPath).toHaveBeenCalledTimes(1)
    expect(deps.shell.openPath).toHaveBeenCalledWith(path.join(root, 'project'))
  })

  it('refuses relative and missing directories', async () => {
    const { call, deps } = setup()

    await expect(call(CH.openDir, 'relative')).resolves.toMatchObject({ ok: false })
    await expect(call(CH.openDir, path.join(root, 'missing'))).resolves.toMatchObject({ ok: false })
    expect(deps.shell.openPath).not.toHaveBeenCalled()
  })

  it('reveals an existing absolute path (selecting it, never opening it) and nothing else', async () => {
    const { call, deps } = setup()

    await expect(call(CH.revealPath, file)).resolves.toBe(true)
    await expect(call(CH.revealPath, 'relative/file')).resolves.toBe(false)
    expect(deps.shell.showItemInFolder).toHaveBeenCalledTimes(1)
    expect(deps.shell.openPath).not.toHaveBeenCalled()
  })
})

describe('selectPaths', () => {
  it('shows a dialog limited to the allowed options and returns only what the user picked', async () => {
    const { call, deps } = setup()

    await expect(call(CH.selectPaths, { properties: ['openDirectory'], title: 'Pick' })).resolves.toEqual(['/picked'])
    expect(deps.dialog.showOpenDialog).toHaveBeenCalledWith({ properties: ['openDirectory'], title: 'Pick' })
  })

  it('drops options it does not allow and returns [] when the user cancels', async () => {
    const { call, deps } = setup()
    vi.mocked(deps.dialog.showOpenDialog).mockResolvedValueOnce({ canceled: true, filePaths: [] })

    await expect(
      call(CH.selectPaths, { filters: [{ extensions: ['*'], name: 'x' }], properties: ['openFile'] })
    ).resolves.toEqual([])
    expect(deps.dialog.showOpenDialog).toHaveBeenCalledWith({ properties: ['openFile'] })
  })
})

describe('clipboard, cwd and logs', () => {
  it('round trips text through the clipboard and ignores non-text writes', async () => {
    const { call, clipboardText } = setup()

    await expect(call(CH.writeClipboard, 'hello')).resolves.toBe(true)
    await expect(call(CH.writeClipboard, { not: 'text' })).resolves.toBe(false)
    await expect(call(CH.readClipboard)).resolves.toBe('hello')
    expect(clipboardText.value).toBe('hello')
  })

  it('sanitises a working directory to an existing absolute directory, else the project root', async () => {
    const { call } = setup()

    await expect(call(CH.sanitizeCwd, path.join(root, 'project'))).resolves.toBe(path.join(root, 'project'))
    await expect(call(CH.sanitizeCwd, file)).resolves.toBe(path.join(root, 'project'))
    await expect(call(CH.sanitizeCwd, '../etc')).resolves.toBe(path.join(root, 'project'))
  })

  it('logs renderer lines and error reports, truncated, and ignores junk', async () => {
    const { call, deps } = setup()

    void call(CH.logRendererLine, 'x'.repeat(5000))
    void call(CH.logRendererLine, 42)
    void call(CH.logRendererError, { boundary: 'Chat', label: 'render', message: 'boom' })

    await Promise.resolve()

    expect(deps.log).toHaveBeenCalledTimes(2)
    expect(vi.mocked(deps.log).mock.calls[0]?.[0].length).toBeLessThan(2100)
    expect(vi.mocked(deps.log).mock.calls[1]?.[0]).toBe('[renderer-error] render Chat: boom')
  })
})
