// The Browser pane hosts web pages in an Electron <webview>. A guest page is untrusted content, so it gets
// nothing: no preload (so no bridge and no boundary token), no Node, a sandbox, a partition that is never
// written to disk, no permissions, no downloads, and only http(s) to navigate to. Links that want a new
// window open in the system browser through the shell's external-link opener.

/** In memory only: no `persist:` prefix, so cookies and storage vanish with the app. */
export const GUEST_PARTITION = 'vanta-preview-guest'

const WEB_PROTOCOLS = new Set(['http:', 'https:'])
const MAX_URL_LENGTH = 4096

/** Only web pages may be a guest's top-level page. `file:`, `javascript:`, `data:`, `vanta:` and the rest are refused. */
export function isAllowedGuestUrl(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_LENGTH) {
    return false
  }

  try {
    return WEB_PROTOCOLS.has(new URL(raw).protocol)
  } catch {
    return false
  }
}

/** The preferences Electron builds for a guest, as `will-attach-webview` hands them over. */
export interface GuestWebPreferences {
  [key: string]: unknown
  contextIsolation?: boolean
  nodeIntegration?: boolean
  nodeIntegrationInSubFrames?: boolean
  nodeIntegrationInWorker?: boolean
  partition?: string
  preload?: string
  sandbox?: boolean
  webSecurity?: boolean
  webviewTag?: boolean
}

/** Mutates the guest's preferences to the locked-down set, whatever the page asked for. */
export function lockGuestPreferences(prefs: GuestWebPreferences): void {
  delete prefs.preload
  delete prefs.preloadURL
  prefs.contextIsolation = true
  prefs.nodeIntegration = false
  prefs.nodeIntegrationInSubFrames = false
  prefs.nodeIntegrationInWorker = false
  prefs.sandbox = true
  prefs.webSecurity = true
  prefs.webviewTag = false
  prefs.allowRunningInsecureContent = false
  prefs.enableRemoteModule = false
  prefs.safeDialogs = true
  // The partition Electron builds the guest's session from; the attribute alone is read too early.
  prefs.partition = GUEST_PARTITION
}

export interface AttachParams {
  [key: string]: unknown
  partition?: string
  src?: string
}

/** The decision for one `<webview>` attach: false cancels it. Parameters and preferences are rewritten in place. */
export function guardAttach(prefs: GuestWebPreferences, params: AttachParams): boolean {
  lockGuestPreferences(prefs)
  params.partition = GUEST_PARTITION
  delete params.preload
  delete params.allowpopups
  delete params.disablewebsecurity
  delete params.nodeintegration
  delete params.nodeintegrationinsubframes
  delete params.webpreferences

  // The pane builds an empty guest first and loads the page into it; an empty guest is harmless.
  return params.src === 'about:blank' || isAllowedGuestUrl(params.src)
}

/** What the guest's session may do: nothing that asks the user for a capability, and no downloads. */
export interface GuestSessionLike {
  on: (event: 'will-download', listener: (event: { preventDefault: () => void }) => void) => void
  setPermissionCheckHandler: (handler: () => boolean) => void
  setPermissionRequestHandler: (handler: (...args: unknown[]) => void) => void
  setDevicePermissionHandler?: (handler: () => boolean) => void
  webRequest?: {
    onBeforeRequest: (
      filter: { urls: string[] },
      listener: (details: unknown, callback: (response: { cancel: boolean }) => void) => void
    ) => void
  }
}

/** What a guest page may fetch: the web, sockets, and the inline data its own page produces. Never `file:` or `ftp:`. */
const FETCHABLE_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:', 'data:', 'blob:'])

export function isFetchableByGuest(raw: unknown): boolean {
  try {
    return typeof raw === 'string' && FETCHABLE_PROTOCOLS.has(new URL(raw).protocol)
  } catch {
    return false
  }
}

export function lockGuestSession(session: GuestSessionLike): void {
  session.setPermissionRequestHandler((...args) => {
    // Electron passes (webContents, permission, callback, details).
    const callback = args.find(arg => typeof arg === 'function')

    if (typeof callback === 'function') {
      callback(false)
    }
  })
  session.setPermissionCheckHandler(() => false)
  session.setDevicePermissionHandler?.(() => false)
  session.on('will-download', event => event.preventDefault())
  session.webRequest?.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) =>
    callback({ cancel: !isFetchableByGuest((details as { url?: unknown }).url) })
  )
}

/**
 * Electron refuses a guest's popup before any handler sees it, and the guest has no preload to tell us a
 * link was clicked. So the guard injects a small script that turns a `target=_blank` click (or window.open)
 * into a navigation to this scheme; `will-navigate` sees it, cancels it, and hands the real address to the
 * system browser. A page can write the same address, so it only counts right after a real click or key
 * press in the guest, and no more than one per second.
 */
export const OPEN_SCHEME = 'vanta-guest-open:'
const GESTURE_WINDOW_MS = 2000
const OPEN_INTERVAL_MS = 1000

export const GUEST_OPEN_SCRIPT = `(() => {
  const send = (url) => { try { location.assign(${JSON.stringify(OPEN_SCHEME)} + encodeURIComponent(new URL(url, location.href).href)); } catch {} };
  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[target]') : null;
    if (link && link.target && !/^_(self|parent|top)$/i.test(link.target) && link.href) { event.preventDefault(); send(link.href); }
  }, true);
  window.open = (url) => { if (url) send(String(url)); return null; };
})()`

/** The web address a guest asked to open elsewhere, or null when the navigation is not such a request. */
export function parseGuestOpen(raw: string): null | string {
  if (!raw.startsWith(OPEN_SCHEME)) {
    return null
  }

  try {
    const target = decodeURIComponent(raw.slice(OPEN_SCHEME.length))

    return isAllowedGuestUrl(target) ? target : null
  } catch {
    return null
  }
}

export interface GuestContentsLike {
  executeJavaScript?: (code: string) => Promise<unknown>
  on: (event: string, listener: (...args: any[]) => void) => void
  setWindowOpenHandler: (handler: (details: { url: string }) => { action: 'deny' }) => void
}

const GESTURES = new Set(['mouseDown', 'mouseUp', 'keyDown', 'rawKeyDown', 'char'])

/** A guest never navigates itself off the web and never opens windows of its own: a link meant for a new window goes to the system browser. */
export function lockGuestContents(guest: GuestContentsLike, openExternal: (url: string) => void, now: () => number = Date.now): void {
  let lastGesture = Number.NEGATIVE_INFINITY
  let lastOpen = Number.NEGATIVE_INFINITY

  guest.setWindowOpenHandler(({ url }) => {
    if (isAllowedGuestUrl(url)) {
      openExternal(url)
    }

    return { action: 'deny' }
  })

  guest.on('input-event', (_event: unknown, input: { type?: string }) => {
    if (input?.type && GESTURES.has(input.type)) {
      lastGesture = now()
    }
  })

  guest.on('dom-ready', () => {
    void guest.executeJavaScript?.(GUEST_OPEN_SCRIPT).catch(() => undefined)
  })

  for (const event of ['will-navigate', 'will-redirect', 'will-frame-navigate']) {
    guest.on(event, (navigation: { preventDefault: () => void }, url: string) => {
      const requested = parseGuestOpen(url)

      if (requested || url.startsWith(OPEN_SCHEME)) {
        navigation.preventDefault()

        if (requested && now() - lastGesture <= GESTURE_WINDOW_MS && now() - lastOpen >= OPEN_INTERVAL_MS) {
          lastOpen = now()
          openExternal(requested)
        }

        return
      }

      if (!isAllowedGuestUrl(url)) {
        navigation.preventDefault()
      }
    })
  }
}

/** The pieces of Electron the guard touches, so tests can stand in for them. */
export interface GuardHost {
  fromPartition: (partition: string) => GuestSessionLike
  onWebContentsCreated: (listener: (contents: HostContentsLike) => void) => void
  openExternal: (url: string) => void
}

export interface HostContentsLike {
  getType: () => string
  on: (event: string, listener: (...args: any[]) => void) => void
}

/**
 * Turn on guest hosting for every window, safely. A `<webview>` is only ever attached through this gate:
 * the guard rewrites its preferences and partition, cancels it for a non-web address, and locks the
 * guest's session and contents once they exist.
 */
export function installWebviewGuard(host: GuardHost): void {
  lockGuestSession(host.fromPartition(GUEST_PARTITION))

  host.onWebContentsCreated(contents => {
    if (contents.getType() !== 'window') {
      return
    }

    contents.on('will-attach-webview', (event: { preventDefault: () => void }, prefs: GuestWebPreferences, params: AttachParams) => {
      if (!guardAttach(prefs, params)) {
        event.preventDefault()
      }
    })

    contents.on('did-attach-webview', (_event: unknown, guest: GuestContentsLike) => lockGuestContents(guest, host.openExternal))
  })
}
