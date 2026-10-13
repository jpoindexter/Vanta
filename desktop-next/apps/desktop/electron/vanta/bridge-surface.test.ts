import { describe, expect, it } from 'vitest'

import { type IpcRendererLike, leafNames, UNSUPPORTED_PREFIX } from './bridge-core'
import { buildHermesDesktop, buildImplemented, buildVantaDesktop } from './bridge-surface'
import { env, fakeIpc, legacyLeafNames } from './bridge-test-helpers'
import { CH } from './channels'

describe('window.hermesDesktop surface', () => {
  const OMITTED_ON_PURPOSE = ['screenshot', 'hudModifier']

  it('keeps every member name the Hermes renderer calls, so nothing is undefined at call time', () => {
    const legacy = legacyLeafNames()
    const surface = leafNames(buildHermesDesktop(env(fakeIpc().ipc)))

    expect(legacy.length).toBeGreaterThan(200)
    expect(
      legacy.filter(
        name =>
          !OMITTED_ON_PURPOSE.some(omit => name === omit || name.startsWith(`${omit}.`)) && !surface.includes(name)
      )
    ).toEqual([])
  })

  it('implements the slice-1 members for real and stubs the rest', () => {
    const real = new Set(leafNames(buildImplemented(env(fakeIpc().ipc))))
    const all = leafNames(buildHermesDesktop(env(fakeIpc().ipc)))

    for (const name of [
      'api',
      'getConnection',
      'getGatewayWsUrl',
      'openExternal',
      'revealPath',
      'notify',
      'windowControls.close',
      'settings.pickDefaultProjectDir',
      'vanta.request',
      'readDir',
      'gitRoot',
      'readFileText',
      'readFileDataUrl',
      'normalizePreviewTarget',
      'watchDirectory',
      'watchPreviewFile',
      'stopPreviewFileWatch',
      'onPreviewFileChanged',
      'git.repoStatus',
      'git.fileDiff',
      'git.branchList',
      'git.review.list',
      'git.review.diff',
      'git.review.revParse'
    ]) {
      expect(real.has(name)).toBe(true)
    }

    // What stays unsupported on purpose: pty, updater, cloud and pool, plugin installs, pets, file writes.
    for (const name of ['updates.check', 'cloud.status', 'petOverlay.open', 'writeTextFile', 'installDesktopPlugin']) {
      expect(real.has(name)).toBe(false)
    }

    expect(all.length - real.size).toBeGreaterThan(100)
  })

  it('rejects an unimplemented async member with an "unsupported:" message naming it', async () => {
    const desktop = buildHermesDesktop(env(fakeIpc().ipc)) as Record<string, any>

    await expect(desktop.getPoolLimits()).rejects.toThrow(`${UNSUPPORTED_PREFIX} getPoolLimits is not available`)
    await expect(desktop.git.review.commitContext()).rejects.toThrow('git.review.commitContext')
    await expect(desktop.updates.check()).rejects.toThrow('updates.check')
  })

  it('gives unimplemented subscriptions a no-op unsubscribe, flags false and facts null', () => {
    const desktop = buildHermesDesktop(env(fakeIpc().ipc)) as Record<string, any>

    expect(desktop.onDeepLink(() => undefined)()).toBeUndefined()
    expect(desktop.glassSupported).toBe(false)
    expect(desktop.localSkin).toBeNull()
    expect(desktop.screenshot).toBeUndefined()
  })

  it('does not expose the boundary token or a way to read it', () => {
    const everything = JSON.stringify([
      leafNames(buildHermesDesktop(env(fakeIpc().ipc))),
      leafNames(buildVantaDesktop(env(fakeIpc().ipc)))
    ])

    expect(everything.toLowerCase()).not.toContain('boundarytoken')
  })
})

describe('api proxy', () => {
  it('resolves the response body of a successful call', async () => {
    const { invoked, ipc } = fakeIpc({ data: [{ id: 's1' }], ok: true, status: 200 })
    const desktop = buildHermesDesktop(env(ipc)) as Record<string, any>

    await expect(desktop.api({ method: 'delete', path: '/api/sessions/s1' })).resolves.toEqual([{ id: 's1' }])
    expect(invoked[0]).toEqual([
      CH.request,
      { body: undefined, clientId: undefined, method: 'DELETE', path: '/api/sessions/s1', timeoutMs: undefined }
    ])
  })

  it('rejects "<status>: <detail>" like the Hermes proxy, so existing catch blocks keep working', async () => {
    const desktop = buildHermesDesktop(
      env(fakeIpc({ data: { error: 'session not found' }, ok: false, status: 404 }).ipc)
    ) as Record<string, any>

    await expect(desktop.api({ path: '/api/sessions/open' })).rejects.toThrow('404: session not found')
  })

  it('reports an unreachable server as "unreachable"', async () => {
    const desktop = buildHermesDesktop(
      env(fakeIpc({ data: { error: 'fetch failed' }, ok: false, status: 0 }).ipc)
    ) as Record<string, any>

    await expect(desktop.api({ path: '/api/status' })).rejects.toThrow('unreachable: fetch failed')
  })

  it('refuses multipart uploads, which Vanta has no route for', async () => {
    const desktop = buildHermesDesktop(env(fakeIpc().ipc)) as Record<string, any>

    await expect(desktop.api({ path: '/api/x', upload: { bytes: new ArrayBuffer(1), filename: 'a' } })).rejects.toThrow(
      'unsupported: multipart'
    )
  })
})
