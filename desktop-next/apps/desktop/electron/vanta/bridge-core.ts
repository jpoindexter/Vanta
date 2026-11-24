import type { StubKind, SurfaceManifest } from './surface-manifest'

/** The slice of Electron's ipcRenderer the bridge uses, so it can be exercised without Electron. */
export interface IpcRendererLike {
  invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>
  on: (channel: string, listener: (event: unknown, ...args: never[]) => void) => unknown
  removeListener: (channel: string, listener: (event: unknown, ...args: never[]) => void) => unknown
  send: (channel: string, ...args: unknown[]) => void
}

export const UNSUPPORTED_PREFIX = 'unsupported:'

export function unsupportedMessage(member: string): string {
  return `${UNSUPPORTED_PREFIX} ${member} is not available in Vanta Desktop yet`
}

/** Subscribe to a main-process push. Returns the unsubscribe function the renderer expects. */
export function subscribe<T>(ipc: IpcRendererLike, channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T) => callback(payload)
  ipc.on(channel, listener as (event: unknown, ...args: never[]) => void)

  return () => {
    ipc.removeListener(channel, listener as (event: unknown, ...args: never[]) => void)
  }
}

function stubFor(member: string, kind: StubKind): unknown {
  switch (kind) {
    case 'async':
      return () => Promise.reject(new Error(unsupportedMessage(member)))
    case 'event':
      return () => () => undefined
    case 'send':
      return () => undefined
    case 'flag':
      return false
    case 'null':
      return null
    case 'omit':
      return undefined
  }
}

/** Build the stand-in tree for every manifest entry. `contextBridge` cannot expose a Proxy, so each member is listed explicitly. */
export function stubsFrom(manifest: SurfaceManifest, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  for (const [name, entry] of Object.entries(manifest)) {
    const member = prefix ? `${prefix}.${name}` : name

    if (typeof entry === 'string') {
      if (entry !== 'omit') {
        out[name] = stubFor(member, entry)
      }
    } else {
      out[name] = stubsFrom(entry, member)
    }
  }

  return out
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** Real members win over stubs, key by key, so a half-implemented namespace keeps its stubbed remainder. */
export function mergeSurface(stubs: Record<string, unknown>, real: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...stubs }

  for (const [name, value] of Object.entries(real)) {
    const stub = out[name]
    out[name] = isPlainObject(value) && isPlainObject(stub) ? mergeSurface(stub, value) : value
  }

  return out
}

/** Names of every leaf member in a surface, as `a.b.c`. Used by the surface document and its test. */
export function leafNames(surface: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(surface).flatMap(([name, value]) => {
    const member = prefix ? `${prefix}.${name}` : name

    return isPlainObject(value) ? leafNames(value, member) : [member]
  })
}
