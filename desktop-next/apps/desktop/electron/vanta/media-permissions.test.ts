import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  appPage,
  installMediaPermissions,
  type MediaPermissionOptions,
  mediaPermissionCheck,
  mediaPermissionRequest,
  type PermissionDetails
} from './media-permissions'

const APP_ROOT = '/Applications/Vanta Next.app/Contents/Resources/app'

function fixture(devServer: null | string = 'http://127.0.0.1:5174') {
  let url = devServer ? `${devServer}/` : pathToFileURL(path.join(APP_ROOT, 'dist', 'index.html')).toString()
  const webContents = { getURL: () => url, isDestroyed: () => false }
  const window = { isDestroyed: () => false, webContents }
  const windows = [window]
  const origin = devServer ? new URL(devServer).origin : 'file://'
  const options: MediaPermissionOptions = { getWindows: () => windows, page: appPage(devServer ?? undefined, APP_ROOT) }

  const details: PermissionDetails = {
    isMainFrame: true,
    mediaType: 'audio',
    mediaTypes: ['audio'],
    requestingUrl: url,
    securityOrigin: origin
  }

  return { details, options, origin, setUrl: (next: string) => (url = next), webContents, window, windows }
}

const request = (f: ReturnType<typeof fixture>, permission = 'media', details: PermissionDetails = f.details) =>
  mediaPermissionRequest(f.webContents, permission, { details, options: f.options })

const check = (
  f: ReturnType<typeof fixture>,
  permission = 'media',
  details: PermissionDetails = f.details,
  origin = f.origin
) => mediaPermissionCheck(f.webContents, permission, origin, { details, options: f.options })

describe.each([
  ['dev server', 'http://127.0.0.1:5174'],
  ['packaged file page', null]
])('microphone permission: %s', (_name, devServer) => {
  it('allows audio, and only audio, for the main frame of the app page', () => {
    const f = fixture(devServer)

    expect(request(f)).toBe(true)
    expect(check(f)).toBe(true)
  })

  it('denies video, audio plus video, an empty list and unknown media', () => {
    const f = fixture(devServer)

    for (const mediaTypes of [['video'], ['audio', 'video'], [], ['unknown'], undefined]) {
      expect(request(f, 'media', { ...f.details, mediaTypes })).toBe(false)
    }

    for (const mediaType of ['video', 'unknown', undefined]) {
      expect(check(f, 'media', { ...f.details, mediaType })).toBe(false)
    }
  })

  it('denies everything the Vanta handler allowed besides audio: video capture and fullscreen', () => {
    const f = fixture(devServer)

    for (const permission of ['videoCapture', 'audioCapture', 'fullscreen', 'automatic-fullscreen']) {
      expect(request(f, permission)).toBe(false)
      expect(check(f, permission)).toBe(false)
    }
  })

  it('denies other permissions a page could ask for', () => {
    const f = fixture(devServer)

    for (const permission of ['display-capture', 'geolocation', 'notifications', 'clipboard-read', 'midi', 'unknown']) {
      expect(request(f, permission)).toBe(false)
      expect(check(f, permission)).toBe(false)
    }
  })

  it('denies a subframe, even one that reports the app origin', () => {
    const f = fixture(devServer)

    expect(request(f, 'media', { ...f.details, isMainFrame: false })).toBe(false)
    expect(check(f, 'media', { ...f.details, isMainFrame: false })).toBe(false)
    expect(request(f, 'media', { ...f.details, isMainFrame: undefined })).toBe(false)
  })

  it('denies a request that names a foreign requesting page, security origin or embedding origin', () => {
    const f = fixture(devServer)

    for (const patch of [
      { requestingUrl: 'https://example.com/' },
      { securityOrigin: 'https://example.com' },
      { embeddingOrigin: 'https://example.com' },
      { requestingUrl: 'data:text/html,x' }
    ]) {
      expect(request(f, 'media', { ...f.details, ...patch })).toBe(false)
      expect(check(f, 'media', { ...f.details, ...patch })).toBe(false)
    }

    expect(check(f, 'media', f.details, 'https://example.com')).toBe(false)
  })

  it('denies when the window is already showing a foreign page', () => {
    const f = fixture(devServer)
    f.setUrl('https://example.com/')

    expect(request(f)).toBe(false)
    expect(check(f)).toBe(false)
  })

  it('denies webContents that are not one of the app windows, a missing one, and destroyed windows', () => {
    const f = fixture(devServer)
    const stranger = { getURL: f.webContents.getURL, isDestroyed: () => false }

    expect(mediaPermissionRequest(stranger, 'media', { details: f.details, options: f.options })).toBe(false)
    expect(mediaPermissionRequest(null, 'media', { details: f.details, options: f.options })).toBe(false)
    expect(mediaPermissionCheck(null, 'media', f.origin, { details: f.details, options: f.options })).toBe(false)

    f.window.isDestroyed = () => true
    expect(request(f)).toBe(false)
    f.window.isDestroyed = () => false
    f.webContents.isDestroyed = () => true
    expect(request(f)).toBe(false)
  })

  it('allows the chat Copy action to write sanitised text, for the trusted main frame only', () => {
    const f = fixture(devServer)

    expect(request(f, 'clipboard-sanitized-write')).toBe(true)
    expect(check(f, 'clipboard-sanitized-write')).toBe(true)
    expect(request(f, 'clipboard-sanitized-write', { ...f.details, isMainFrame: false })).toBe(false)
    expect(request(f, 'clipboard-read')).toBe(false)
  })
})

describe('what counts as the app page', () => {
  it('pins the dev server to its exact origin: other hosts, ports, schemes and credentials are denied', () => {
    const f = fixture('http://127.0.0.1:5174')

    for (const requestingUrl of [
      'http://localhost:5174/',
      'http://127.0.0.1:5175/',
      'https://127.0.0.1:5174/',
      'http://user@127.0.0.1:5174/',
      'not a url'
    ]) {
      expect(request(f, 'media', { ...f.details, requestingUrl })).toBe(false)
    }

    expect(check(f, 'media', f.details, 'http://127.0.0.1:9999')).toBe(false)
  })

  it('pins a packaged app to its own index.html, not to any file: page', () => {
    const f = fixture(null)
    f.setUrl('file:///Users/someone/Downloads/evil.html')

    expect(request(f, 'media', { ...f.details, requestingUrl: 'file:///Users/someone/Downloads/evil.html' })).toBe(
      false
    )
  })

  it('still recognises the app page with a query or hash, as the mini and quick-entry windows use', () => {
    const dev = fixture('http://127.0.0.1:5174')
    dev.setUrl('http://127.0.0.1:5174/?win=quick')
    expect(request(dev, 'media', { ...dev.details, requestingUrl: 'http://127.0.0.1:5174/?win=quick' })).toBe(true)

    const packaged = fixture(null)
    const url = `${pathToFileURL(path.join(APP_ROOT, 'dist', 'index.html')).toString()}#/mini`
    packaged.setUrl(url)
    expect(request(packaged, 'media', { ...packaged.details, requestingUrl: url })).toBe(true)
  })
})

describe('installMediaPermissions', () => {
  it('registers both handlers and judges the window as it is at request time', () => {
    const f = fixture('http://127.0.0.1:5174')
    const handlers: { check?: (...args: never[]) => boolean; request?: (...args: never[]) => void } = {}

    installMediaPermissions(
      {
        setPermissionCheckHandler: handler => {
          handlers.check = handler as never
        },
        setPermissionRequestHandler: handler => {
          handlers.request = handler as never
        }
      },
      f.options
    )

    let granted: boolean | undefined
    const ask = () =>
      (handlers.request as unknown as (...args: unknown[]) => void)(
        f.webContents,
        'media',
        (value: boolean) => (granted = value),
        f.details
      )

    ask()
    expect(granted).toBe(true)
    expect((handlers.check as unknown as (...args: unknown[]) => boolean)(f.webContents, 'media', f.origin, f.details)).toBe(
      true
    )

    // The window navigates away after registration: the same handlers now refuse.
    f.setUrl('https://example.com/')
    ask()
    expect(granted).toBe(false)

    // The window is closed: nothing is granted to a webContents that no longer belongs to an app window.
    f.windows.length = 0
    f.setUrl('http://127.0.0.1:5174/')
    ask()
    expect(granted).toBe(false)
  })
})
