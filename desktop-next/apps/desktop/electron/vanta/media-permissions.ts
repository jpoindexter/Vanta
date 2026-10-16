// Only the app's own page may open the microphone (V-022). Ported from the Vanta desktop's
// `microphone-permissions.mjs`: audio only, main frame only, pinned to the renderer's own origin.
// Video, fullscreen, screen capture, location, notifications and every other origin are denied.
// The Vanta handler this replaces allowed video and fullscreen; that is deliberately not carried over.
import { pathToFileURL } from 'node:url'
import path from 'node:path'

/** The slice of Electron's permission `details` this policy reads. */
export interface PermissionDetails {
  embeddingOrigin?: string
  isMainFrame?: boolean
  mediaType?: string
  mediaTypes?: readonly string[]
  requestingUrl?: string
  securityOrigin?: string
}

interface WebContentsLike {
  getURL: () => string
  isDestroyed: () => boolean
}

interface WindowLike {
  isDestroyed: () => boolean
  webContents: WebContentsLike
}

/** What counts as the app's own page. */
export interface AppPage {
  /** An origin string as Electron reports it (`requestingOrigin`, `securityOrigin`, `embeddingOrigin`). */
  matchesOrigin: (origin: string) => boolean
  /** A full URL: the page itself, whatever its query or hash. */
  matchesUrl: (url: string) => boolean
}

export interface MediaPermissionOptions {
  /** Read at request time, so windows opened or replaced after registration are judged as they are then. */
  getWindows: () => readonly WindowLike[]
  page: AppPage
}

function parse(value: string): URL | null {
  try {
    const url = new URL(value)

    return url.username || url.password ? null : url
  } catch {
    return null
  }
}

/**
 * Dev: the dev server's exact origin (so `localhost` is not `127.0.0.1`, and another port is another origin).
 * Packaged: the one `dist/index.html` file URL. A different `file:` page is not the app.
 */
export function appPage(devServer: string | undefined, appRoot: string): AppPage {
  if (devServer) {
    const origin = new URL(devServer).origin

    return { matchesOrigin: value => value === origin, matchesUrl: value => parse(value)?.origin === origin }
  }

  const index = pathToFileURL(path.join(appRoot, 'dist', 'index.html'))

  return {
    matchesOrigin: value => value === 'file://' || value === 'file:///',
    matchesUrl: value => {
      const url = parse(value)

      return url?.protocol === 'file:' && url.host === '' && url.pathname === index.pathname
    }
  }
}

function trustedMainFrame(webContents: unknown, details: PermissionDetails, options: MediaPermissionOptions): boolean {
  if (!webContents || details.isMainFrame !== true) {
    return false
  }

  // Identity, not a look-alike: a webview guest or a window that is not ours has a different webContents.
  const owner = options.getWindows().find(window => !window.isDestroyed() && window.webContents === webContents)

  if (!owner || owner.webContents.isDestroyed() || !options.page.matchesUrl(owner.webContents.getURL())) {
    return false
  }

  return [details.requestingUrl, details.securityOrigin, details.embeddingOrigin]
    .filter((value): value is string => value !== undefined)
    .every(value => options.page.matchesOrigin(value) || options.page.matchesUrl(value))
}

// The chat's Copy action writes sanitised text; that is not a clipboard read and stays allowed to the app page.
const CLIPBOARD_WRITE = 'clipboard-sanitized-write'

/** `setPermissionCheckHandler`: synchronous questions such as "may this page use the microphone?". */
export function mediaPermissionCheck(
  webContents: unknown,
  permission: string,
  requestingOrigin: string,
  context: { details?: PermissionDetails; options: MediaPermissionOptions }
): boolean {
  const { details = {}, options } = context

  if (!trustedMainFrame(webContents, details, options) || !options.page.matchesOrigin(requestingOrigin)) {
    return false
  }

  return permission === CLIPBOARD_WRITE || (permission === 'media' && details.mediaType === 'audio')
}

/** `setPermissionRequestHandler`: the prompt-style path. A capture request must ask for audio and nothing else. */
export function mediaPermissionRequest(
  webContents: unknown,
  permission: string,
  context: { details?: PermissionDetails; options: MediaPermissionOptions }
): boolean {
  const { details = {}, options } = context

  if (!trustedMainFrame(webContents, details, options)) {
    return false
  }

  if (permission === CLIPBOARD_WRITE) {
    return true
  }

  const types = details.mediaTypes

  return permission === 'media' && Array.isArray(types) && types.length === 1 && types[0] === 'audio'
}

interface SessionLike {
  setPermissionCheckHandler: (
    handler: (webContents: unknown, permission: string, requestingOrigin: string, details: PermissionDetails) => boolean
  ) => void
  setPermissionRequestHandler: (
    handler: (
      webContents: unknown,
      permission: string,
      callback: (granted: boolean) => void,
      details: PermissionDetails
    ) => void
  ) => void
}

/** Register before any page loads. Without a handler Electron grants every permission a page asks for. */
export function installMediaPermissions(session: SessionLike, options: MediaPermissionOptions): void {
  session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) =>
    mediaPermissionCheck(webContents, permission, requestingOrigin, { details, options })
  )
  session.setPermissionRequestHandler((webContents, permission, callback, details) =>
    callback(mediaPermissionRequest(webContents, permission, { details, options }))
  )
}
