import { describe, expect, it } from 'vitest'

import { buildHermesDesktop, buildVantaDesktop } from './bridge-surface'
import { env, fakeIpc } from './bridge-test-helpers'
import { CH } from './channels'

describe('connection and boot', () => {
  it('answers getConnection from main and the websocket url with the opaque local sentinel', async () => {
    const { invoked, ipc } = fakeIpc({ baseUrl: 'http://127.0.0.1:7790' })
    const desktop = buildHermesDesktop(env(ipc)) as Record<string, any>

    await expect(desktop.getConnection()).resolves.toEqual({ baseUrl: 'http://127.0.0.1:7790' })
    await expect(desktop.getGatewayWsUrl()).resolves.toBe('vanta://local')
    await expect(desktop.getGatewayWsUrlFor({})).resolves.toBe('vanta://local')
    expect(invoked[0]?.[0]).toBe(CH.connection)
  })

  it('subscribes to boot progress and backend exit and unsubscribes cleanly', () => {
    const { emit, ipc, listenerCount } = fakeIpc()
    const desktop = buildHermesDesktop(env(ipc)) as Record<string, any>
    const seen: unknown[] = []
    const off = desktop.onBackendExit((payload: unknown) => seen.push(payload))

    emit(CH.backendExit, { code: 1, signal: null })
    off()
    emit(CH.backendExit, { code: 2, signal: null })

    expect(seen).toEqual([{ code: 1, signal: null }])
    expect(listenerCount(CH.backendExit)).toBe(0)
  })

  it('has no install or update flow to show: bootstrap is reported idle', async () => {
    const desktop = buildHermesDesktop(env(fakeIpc().ipc)) as Record<string, any>

    await expect(desktop.getBootstrapState()).resolves.toMatchObject({ active: false, error: null })
    await expect(desktop.probeLocalBackend()).resolves.toEqual({ bootstrapNeeded: false })
  })
})

describe('window, zoom, and native members', () => {
  it('sends window controls, and clamps zoom to a sane range', () => {
    const { ipc, sent } = fakeIpc()
    const zoomEnv = env(ipc)
    const desktop = buildHermesDesktop(zoomEnv) as Record<string, any>

    desktop.windowControls.toggleMaximize()
    desktop.zoom.setPercent(900)
    desktop.zoom.setPercent(10)

    expect(sent).toEqual([
      [CH.windowControl, 'toggle-maximize'],
      [CH.zoomPersist, 300],
      [CH.zoomPersist, 50]
    ])
    expect(zoomEnv.zoom.set).toHaveBeenNthCalledWith(1, 3)
    expect(zoomEnv.zoom.set).toHaveBeenNthCalledWith(2, 0.5)
  })

  it('resolves a dropped file to a path, and "" when the lookup throws', () => {
    const throwing = {
      ...env(fakeIpc().ipc),
      pathForFile: () => {
        throw new Error('nope')
      }
    }

    expect((buildHermesDesktop(env(fakeIpc().ipc)) as Record<string, any>).getPathForFile('a.txt')).toBe(
      '/dropped/a.txt'
    )
    expect((buildHermesDesktop(throwing) as Record<string, any>).getPathForFile('a.txt')).toBe('')
  })

  it('routes openExternal, revealPath, notify and project pickers to their channels', async () => {
    const { invoked, ipc } = fakeIpc(true)
    const desktop = buildHermesDesktop(env(ipc)) as Record<string, any>

    await desktop.openExternal('https://example.com')
    await desktop.revealPath('/work')
    await desktop.notify({ title: 'Done' })
    await desktop.settings.pickDefaultProjectDir()

    expect(invoked.map(call => call[0])).toEqual([CH.openExternal, CH.revealPath, CH.notify, CH.projectPickDefault])
  })

  it('exposes only the Vanta-specific members under vantaDesktop', async () => {
    const { invoked, ipc } = fakeIpc({ files: [] })
    const vanta = buildVantaDesktop(env(ipc)) as Record<string, any>

    expect(Object.keys(vanta).sort()).toEqual([
      'acknowledgePendingProjectTask',
      'pickAttachments',
      'pickProjectFolder',
      'readClipboard',
      'readPendingProjectTask',
      'resolveDroppedFiles',
      'switchProjectForNewTask'
    ])
    await vanta.resolveDroppedFiles(['a', 'b'])
    expect(invoked[0]).toEqual([CH.resolveDroppedPaths, ['/dropped/a', '/dropped/b']])
  })
})

describe('backend recovery over IPC', () => {
  it('recycleBackend asks main to restart the runtime', async () => {
    const { invoked, ipc } = fakeIpc()
    const desktop = buildHermesDesktop(env(ipc)) as Record<string, any>

    await desktop.recycleBackend('default')

    expect(invoked[0]?.[0]).toBe(CH.backendRecycle)
  })
})

describe('vanta event streams over IPC', () => {
  it('multiplexes many streams over one listener pair and routes each frame to its stream', () => {
    const { emit, ipc, listenerCount, sent } = fakeIpc()
    const desktop = buildHermesDesktop(env(ipc)) as Record<string, any>
    const a: unknown[] = []
    const b: unknown[] = []
    const closed: string[] = []

    desktop.vanta.openEvents('chat-a', {
      onClose: (reason: string) => closed.push(reason),
      onFrame: (f: unknown) => a.push(f)
    })
    desktop.vanta.openEvents('chat-b', { onClose: () => undefined, onFrame: (f: unknown) => b.push(f) })

    const [aOpen, bOpen] = sent.filter(call => call[0] === CH.eventsOpen)
    emit(CH.eventsFrame, aOpen?.[1], { delta: 'to a' })
    emit(CH.eventsFrame, bOpen?.[1], { delta: 'to b' })
    emit(CH.eventsClosed, aOpen?.[1], 'stream ended')

    expect([a, b, closed]).toEqual([[{ delta: 'to a' }], [{ delta: 'to b' }], ['stream ended']])
    expect(aOpen?.[2]).toBe('chat-a')
    expect(listenerCount(CH.eventsFrame)).toBe(1)
  })

  it('tells main to close a stream when the renderer unsubscribes, once', () => {
    const { ipc, sent } = fakeIpc()
    const desktop = buildHermesDesktop(env(ipc)) as Record<string, any>
    const stop = desktop.vanta.openEvents('chat', { onClose: () => undefined, onFrame: () => undefined })

    stop()
    stop()

    expect(sent.filter(call => call[0] === CH.eventsClose)).toHaveLength(1)
  })
})

describe('terminal members', () => {
  it('start, write, resize, attach, cwd and dispose go to the main process, and data is filtered by terminal id', async () => {
    const { emit, invoked, ipc } = fakeIpc({ id: 'vt1' })
    const desktop = buildHermesDesktop(env(ipc)) as Record<string, any>
    const seen: string[] = []
    const exits: unknown[] = []

    await desktop.terminal.start({ cols: 80, rows: 24 })
    await desktop.terminal.write('vt1', 'ls\r')
    await desktop.terminal.resize('vt1', { cols: 100, rows: 30 })
    await desktop.terminal.attach('vt1')
    await desktop.terminal.cwd('vt1')
    await desktop.terminal.dispose('vt1')

    expect(invoked.map(call => call[0])).toEqual([
      CH.terminalStart,
      CH.terminalWrite,
      CH.terminalResize,
      CH.terminalAttach,
      CH.terminalCwd,
      CH.terminalDispose
    ])

    const off = desktop.terminal.onData('vt1', (data: string) => seen.push(data))
    desktop.terminal.onExit('vt1', (exit: unknown) => exits.push(exit))
    emit(CH.terminalData, 'vt1', 'hello')
    emit(CH.terminalData, 'vt2', 'someone else')
    emit(CH.terminalExit, 'vt2', { code: 0, signal: null })
    emit(CH.terminalExit, 'vt1', { code: 0, signal: null })
    off()
    emit(CH.terminalData, 'vt1', 'after unsubscribe')

    expect(seen).toEqual(['hello'])
    expect(exits).toEqual([{ code: 0, signal: null }])
  })
})
