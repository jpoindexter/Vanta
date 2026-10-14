import { describe, expect, it, vi } from 'vitest'

import {
  GUEST_PARTITION,
  guardAttach,
  type GuestContentsLike,
  type GuestSessionLike,
  type HostContentsLike,
  installWebviewGuard,
  isAllowedGuestUrl,
  lockGuestContents,
  lockGuestPreferences,
  lockGuestSession,
  OPEN_SCHEME,
  parseGuestOpen
} from './webview-guard'

describe('isAllowedGuestUrl', () => {
  it.each(['http://127.0.0.1:5173/', 'https://example.com/a?b=c#d', 'HTTP://LOCALHOST/'])('allows %s', url => {
    expect(isAllowedGuestUrl(url)).toBe(true)
  })

  it.each([
    'file:///etc/hosts',
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    'vanta://connections/x',
    'ftp://example.com/',
    'blob:http://example.com/abc',
    'about:blank',
    '//example.com/',
    'not a url',
    '',
    `http://example.com/${'a'.repeat(5000)}`
  ])('refuses %s', url => {
    expect(isAllowedGuestUrl(url)).toBe(false)
  })

  it('refuses anything that is not a string', () => {
    expect(isAllowedGuestUrl(undefined)).toBe(false)
    expect(isAllowedGuestUrl(42)).toBe(false)
  })
})

describe('lockGuestPreferences', () => {
  it('strips the preload and forces isolation, sandbox and no Node whatever was asked', () => {
    const prefs = {
      contextIsolation: false,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
      nodeIntegrationInWorker: true,
      preload: '/app/bridge.js',
      preloadURL: 'file:///app/bridge.js',
      sandbox: false,
      webSecurity: false,
      webviewTag: true
    }

    lockGuestPreferences(prefs)

    expect(prefs).toMatchObject({
      allowRunningInsecureContent: false,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      partition: GUEST_PARTITION,
      sandbox: true,
      webSecurity: true,
      webviewTag: false
    })
    expect('preload' in prefs).toBe(false)
    expect('preloadURL' in prefs).toBe(false)
  })
})

describe('guardAttach', () => {
  it('moves the guest to the in-memory partition and drops preload and security overrides', () => {
    const params = {
      allowpopups: '',
      disablewebsecurity: '',
      nodeintegration: '',
      partition: 'persist:hermes-preview',
      preload: 'file:///app/bridge.js',
      src: 'http://localhost:5173/',
      webpreferences: 'nodeIntegration=yes'
    }

    const prefs = { partition: 'persist:hermes-preview', preload: '/x' }

    expect(guardAttach(prefs, params)).toBe(true)
    expect(prefs.partition).toBe(GUEST_PARTITION)
    expect(params).toEqual({ partition: GUEST_PARTITION, src: 'http://localhost:5173/' })
    expect(GUEST_PARTITION.startsWith('persist:')).toBe(false)
  })

  it('lets the pane attach an empty guest before it loads a page', () => {
    expect(guardAttach({}, { src: 'about:blank' })).toBe(true)
  })

  it.each(['file:///etc/hosts', 'javascript:alert(1)', 'data:text/html,x', 'vanta://x', undefined])('cancels an attach whose page is %s', src => {
    expect(guardAttach({}, { src })).toBe(false)
  })
})

function fakeSession() {
  const handlers: Record<string, (...args: any[]) => unknown> = {}
  let beforeRequest: ((details: unknown, callback: (r: { cancel: boolean }) => void) => void) | undefined
  let filter: { urls: string[] } | undefined

  const session: GuestSessionLike = {
    on: (event, listener) => void (handlers[event] = listener),
    setDevicePermissionHandler: handler => void (handlers.device = handler),
    setPermissionCheckHandler: handler => void (handlers.check = handler),
    setPermissionRequestHandler: handler => void (handlers.request = handler),
    webRequest: {
      onBeforeRequest: (f, listener) => {
        filter = f
        beforeRequest = listener
      }
    }
  }

  return { beforeRequest: () => beforeRequest, filter: () => filter, handlers, session }
}

describe('lockGuestSession', () => {
  it.each(['media', 'geolocation', 'notifications', 'midi', 'clipboard-read', 'fullscreen', 'openExternal'])(
    'denies a %s permission request',
    permission => {
      const { handlers, session } = fakeSession()
      lockGuestSession(session)
      const callback = vi.fn()

      handlers.request?.({}, permission, callback, {})

      expect(callback).toHaveBeenCalledExactlyOnceWith(false)
    }
  )

  it('answers every permission check and device request with no', () => {
    const { handlers, session } = fakeSession()
    lockGuestSession(session)

    expect(handlers.check?.()).toBe(false)
    expect(handlers.device?.()).toBe(false)
  })

  it('cancels downloads', () => {
    const { handlers, session } = fakeSession()
    lockGuestSession(session)
    const event = { preventDefault: vi.fn() }

    handlers['will-download']?.(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it.each([
    ['http://localhost:3000/app.js', false],
    ['https://example.com/x.png', false],
    ['wss://example.com/socket', false],
    ['data:image/png;base64,AAAA', false],
    ['blob:http://localhost:3000/abc', false],
    ['file:///Users/me/.ssh/id_rsa', true],
    ['ftp://example.com/x', true],
    ['vanta://connections/x', true],
    ['not a url', true]
  ])('request for %s is cancelled: %s', (url, cancelled) => {
    const { beforeRequest, filter, session } = fakeSession()
    lockGuestSession(session)
    const callback = vi.fn()

    beforeRequest()?.({ url }, callback)

    expect(filter()?.urls).toEqual(['<all_urls>'])
    expect(callback).toHaveBeenCalledExactlyOnceWith({ cancel: cancelled })
  })
})

function fakeGuest() {
  const listeners: Record<string, (...args: any[]) => void> = {}
  let open: ((details: { url: string }) => { action: 'deny' }) | undefined

  const guest: GuestContentsLike = {
    on: (event, listener) => void (listeners[event] = listener),
    setWindowOpenHandler: handler => void (open = handler)
  }

  return { guest, listeners, open: (url: string) => open?.({ url }) }
}

describe('lockGuestContents', () => {
  it('sends a new-window link to the system browser and always denies the window', () => {
    const { guest, open } = fakeGuest()
    const openExternal = vi.fn()
    lockGuestContents(guest, openExternal)

    expect(open('https://example.com/docs')).toEqual({ action: 'deny' })
    expect(openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com/docs')
  })

  it.each(['file:///etc/hosts', 'javascript:alert(1)', 'data:text/html,x', 'vanta://x'])('does not open %s anywhere', url => {
    const { guest, open } = fakeGuest()
    const openExternal = vi.fn()
    lockGuestContents(guest, openExternal)

    expect(open(url)).toEqual({ action: 'deny' })
    expect(openExternal).not.toHaveBeenCalled()
  })

  it.each(['will-navigate', 'will-redirect', 'will-frame-navigate'])('%s: stays on the web, refuses everything else', event => {
    const { guest, listeners } = fakeGuest()
    lockGuestContents(guest, vi.fn())
    const allowed = { preventDefault: vi.fn() }
    const refused = { preventDefault: vi.fn() }

    listeners[event]?.(allowed, 'http://localhost:3000/next')
    listeners[event]?.(refused, 'file:///Users/x/.ssh/id_rsa')

    expect(allowed.preventDefault).not.toHaveBeenCalled()
    expect(refused.preventDefault).toHaveBeenCalledOnce()
  })
})

describe('parseGuestOpen', () => {
  it('reads a web address out of the relay scheme', () => {
    expect(parseGuestOpen(`${OPEN_SCHEME}${encodeURIComponent('https://example.com/a?b=c')}`)).toBe('https://example.com/a?b=c')
  })

  it.each([
    'https://example.com/',
    `${OPEN_SCHEME}${encodeURIComponent('file:///etc/hosts')}`,
    `${OPEN_SCHEME}${encodeURIComponent('javascript:alert(1)')}`,
    `${OPEN_SCHEME}%E0%A4%A`
  ])('reads nothing from %s', raw => {
    expect(parseGuestOpen(raw)).toBeNull()
  })
})

describe('the new-window relay', () => {
  const request = (url: string) => `${OPEN_SCHEME}${encodeURIComponent(url)}`

  function relay() {
    const { guest, listeners } = fakeGuest()
    const openExternal = vi.fn()
    let clock = 10_000
    lockGuestContents(guest, openExternal, () => clock)

    return { advance: (ms: number) => void (clock += ms), listeners, openExternal }
  }

  it('opens the address in the system browser after a real click, and cancels the navigation', () => {
    const { listeners, openExternal } = relay()
    const event = { preventDefault: vi.fn() }

    listeners['input-event']?.({}, { type: 'mouseDown' })
    listeners['will-navigate']?.(event, request('https://example.com/docs'))

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com/docs')
  })

  it('does nothing without a recent click: a page cannot open links on its own', () => {
    const { advance, listeners, openExternal } = relay()
    const event = { preventDefault: vi.fn() }

    listeners['will-navigate']?.(event, request('https://example.com/'))
    listeners['input-event']?.({}, { type: 'mouseDown' })
    advance(2500)
    listeners['will-navigate']?.(event, request('https://example.com/'))

    expect(event.preventDefault).toHaveBeenCalledTimes(2)
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('ignores mouse movement as a gesture', () => {
    const { listeners, openExternal } = relay()

    listeners['input-event']?.({}, { type: 'mouseMove' })
    listeners['will-navigate']?.({ preventDefault: vi.fn() }, request('https://example.com/'))

    expect(openExternal).not.toHaveBeenCalled()
  })

  it('opens at most one a second', () => {
    const { advance, listeners, openExternal } = relay()
    listeners['input-event']?.({}, { type: 'mouseDown' })

    listeners['will-navigate']?.({ preventDefault: vi.fn() }, request('https://a.example/'))
    listeners['will-navigate']?.({ preventDefault: vi.fn() }, request('https://b.example/'))
    advance(1100)
    listeners['input-event']?.({}, { type: 'mouseDown' })
    listeners['will-navigate']?.({ preventDefault: vi.fn() }, request('https://c.example/'))

    expect(openExternal.mock.calls.map(([url]) => url)).toEqual(['https://a.example/', 'https://c.example/'])
  })

  it('never opens a non-web address, even after a click, and still cancels the navigation', () => {
    const { listeners, openExternal } = relay()
    const event = { preventDefault: vi.fn() }

    listeners['input-event']?.({}, { type: 'mouseDown' })
    listeners['will-navigate']?.(event, request('file:///Users/me/.ssh/id_rsa'))

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('injects the relay script when a page is ready', async () => {
    const { guest, listeners } = fakeGuest()
    const executeJavaScript = vi.fn(async () => undefined)
    lockGuestContents({ ...guest, executeJavaScript }, vi.fn())

    listeners['dom-ready']?.()

    expect(executeJavaScript).toHaveBeenCalledOnce()
    expect(String(executeJavaScript.mock.calls[0]?.[0])).toContain(OPEN_SCHEME)
  })
})

describe('installWebviewGuard', () => {
  function install() {
    const { handlers, session } = fakeSession()
    const created: Array<(contents: HostContentsLike) => void> = []
    const fromPartition = vi.fn(() => session)
    installWebviewGuard({ fromPartition, onWebContentsCreated: listener => created.push(listener), openExternal: vi.fn() })

    const contents = (type: string) => {
      const events: Record<string, (...args: any[]) => void> = {}
      created[0]?.({ getType: () => type, on: (event, listener) => void (events[event] = listener) })

      return events
    }

    return { contents, fromPartition, handlers }
  }

  it('locks the guest partition up front', () => {
    const { fromPartition, handlers } = install()

    expect(fromPartition).toHaveBeenCalledWith(GUEST_PARTITION)
    expect(handlers.check?.()).toBe(false)
  })

  it('gates attach on every window and cancels a non-web page', () => {
    const { contents } = install()
    const events = contents('window')
    const refused = { preventDefault: vi.fn() }
    const allowed = { preventDefault: vi.fn() }
    const prefs = { nodeIntegration: true, preload: '/x' }
    const params = { partition: 'persist:hermes-preview', src: 'file:///etc/hosts' }

    events['will-attach-webview']?.(refused, prefs, params)
    events['will-attach-webview']?.(allowed, {}, { src: 'http://localhost:1/' })

    expect(refused.preventDefault).toHaveBeenCalledOnce()
    expect(allowed.preventDefault).not.toHaveBeenCalled()
    expect(prefs).toMatchObject({ nodeIntegration: false, sandbox: true })
    expect(params.partition).toBe(GUEST_PARTITION)
  })

  it('does not hook guests, devtools or other non-window contents', () => {
    const { contents } = install()

    expect(contents('webview')).toEqual({})
    expect(contents('backgroundPage')).toEqual({})
  })
})
