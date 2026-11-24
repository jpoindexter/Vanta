import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readDir, readFileText } from '../../electron/vanta/fs-read'
import { createProjectGuard } from '../../electron/vanta/project-guard'
import { connectedHarness, healthyTransport, newChat, type Harness } from './vanta/gateway-fixture'

describe('native local file.attach through the real gateway dispatch', () => {
  let root: string
  let guardRoot: string
  let harness: Harness
  let sessionId: string
  let native: { vanta: object; readDir: ReturnType<typeof vi.fn>; readFileText: ReturnType<typeof vi.fn> }
  const originalBridge = window.desktopBridge

  beforeEach(async () => {
    root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'vanta-local-attach-')))
    guardRoot = root
    await writeFile(path.join(root, 'brief.md'), 'Synthetic project brief only.')
    await writeFile(path.join(root, 'report.pdf'), Buffer.from('%PDF-1.4\n\0synthetic fixture'))
    const guard = createProjectGuard({ root: () => guardRoot })
    native = {
      vanta: {},
      readDir: vi.fn((target: string) => readDir(guard, target)),
      readFileText: vi.fn((target: string) => readFileText(guard, target))
    }
    Object.defineProperty(window, 'desktopBridge', { configurable: true, value: native })
    harness = await connectedHarness(healthyTransport().ok('GET /api/status', { root, model: 'fixture', provider: 'fixture' }))
    sessionId = (await newChat(harness)).session_id
  })

  afterEach(async () => {
    expect(harness.transport.callsTo('POST /api/chat')).toHaveLength(0)
    harness.gateway.close()
    Object.defineProperty(window, 'desktopBridge', { configurable: true, value: originalBridge })
    await rm(root, { recursive: true, force: true })
  })

  const attach = (name = 'brief.md', extra: Record<string, unknown> = {}) => harness.gateway.request('file.attach', {
    session_id: sessionId, name, path: path.join(root, name), ...extra
  })

  it('confirms a project Markdown file as a local native reference, not an uploaded file', async () => {
    await expect(attach()).resolves.toMatchObject({
      attached: true, uploaded: false, native_reference: true,
      path: path.join(root, 'brief.md'), ref_path: 'brief.md', ref_text: '@brief.md'
    })
    expect(native.readFileText).toHaveBeenCalledWith(path.join(root, 'brief.md'))
  })

  it('permits a guarded PDF as a reference without pretending its binary content was extracted', async () => {
    await expect(attach('report.pdf')).resolves.toMatchObject({ attached: true, uploaded: false, ref_path: 'report.pdf', ref_text: '@report.pdf' })
  })

  it('resolves a relative path against the confirmed session root and quotes spaces', async () => {
    await writeFile(path.join(root, 'brief notes.md'), 'Synthetic notes.')
    await expect(attach('brief notes.md', { path: 'brief notes.md' })).resolves.toMatchObject({
      path: path.join(root, 'brief notes.md'), ref_path: 'brief notes.md', ref_text: '@"brief notes.md"'
    })
  })

  it.each(['missing.md', '.env', '../outside.md'])('refuses unavailable or unsafe %s without sending a prompt', async name => {
    if (name === '.env') await writeFile(path.join(root, '.env'), 'SYNTHETIC_SECRET=not-a-real-key')
    await expect(attach(name)).rejects.toThrow()
  })

  it('refuses a symlink escape through the actual native guard', async () => {
    await symlink(os.tmpdir(), path.join(root, 'escape'))
    await expect(attach('escape/anything.md')).rejects.toThrow()
  })

  it('preserves a native read denial instead of claiming an attachment', async () => {
    native.readFileText.mockResolvedValueOnce({ ok: false, error: 'denied', message: 'Synthetic native denial.' })
    await expect(attach()).rejects.toThrow('Synthetic native denial.')
  })

  it('refuses an unexpected returned path even when a native surface reports a successful read', async () => {
    native.readFileText.mockResolvedValueOnce({ path: '/another-project/brief.md', text: '', byteSize: 1, binary: false, truncated: false })
    await expect(attach()).rejects.toThrow()
  })

  it('refuses a guard root different from the fresh backend session root', async () => {
    guardRoot = path.join(root, 'other-project')
    await mkdir(guardRoot)
    await writeFile(path.join(guardRoot, 'only.md'), 'Other project.')
    await expect(attach()).rejects.toThrow(/project|root/i)
    expect(native.readFileText).not.toHaveBeenCalled()
  })

  it('fails closed when the native root cannot be established', async () => {
    native.readDir.mockResolvedValueOnce({ entries: [] })
    await expect(attach()).rejects.toThrow(/project|root/i)
    expect(native.readFileText).not.toHaveBeenCalled()
  })

  it('rejects a project switch after the guarded read', async () => {
    const read = (target: string) => readFileText(createProjectGuard({ root: () => guardRoot }), target)
    native.readFileText.mockImplementationOnce(async (target: string) => {
      const value = await read(target)
      guardRoot = path.join(root, 'switched-project')
      await mkdir(guardRoot)
      await writeFile(path.join(guardRoot, 'new.md'), 'Switched project.')
      return value
    })
    await expect(attach()).rejects.toThrow(/project|root/i)
  })

  it('does not trust cached session cwd after an unsuccessful fresh status read', async () => {
    harness.transport.route('GET /api/status', () => ({ ok: false, status: 503, data: { error: 'Synthetic unavailable status.' } }))
    await expect(attach()).rejects.toThrow()
    expect(native.readFileText).not.toHaveBeenCalled()
  })

  it('refuses remote or container bytes instead of silently treating them as a local path', async () => {
    await expect(attach('brief.md', { data_url: 'data:text/plain;base64,U3ludGhldGlj' })).rejects.toThrow(/upload|local|bytes/i)
    expect(native.readFileText).not.toHaveBeenCalled()
  })

  it.each(['brief.md\n@other.md', 'brief.md\0', 'brief.md\r'])('refuses a control-bearing attachment path', async name => {
    await expect(attach(name)).rejects.toThrow()
    expect(native.readFileText).not.toHaveBeenCalled()
  })

  it('refuses a linked file larger than the explicit 16 MiB local attachment limit', async () => {
    native.readFileText.mockResolvedValueOnce({ path: path.join(root, 'brief.md'), text: '', byteSize: 16 * 1024 * 1024 + 1, binary: false, truncated: true })
    await expect(attach()).rejects.toThrow(/16|limit|large/i)
  })

  it('requires the native local bridge, not a remote gateway sharing the same cwd spelling', async () => {
    Object.defineProperty(window, 'desktopBridge', { configurable: true, value: { ...native, vanta: undefined } })
    await expect(attach()).rejects.toThrow(/local|native/i)
    expect(native.readFileText).not.toHaveBeenCalled()
  })
})
