export interface BootProgress {
  error: null | string
  fakeMode: boolean
  message: string
  phase: string
  progress: number
  retryable: boolean
  running: boolean
  timestamp: number
}

export type BootPublisher = (progress: BootProgress) => void

/** The boot story the renderer's connecting overlay renders: starting, then ready or failed with the reason. */
export function createBootTracker(publish: BootPublisher, now: () => number = Date.now) {
  let current: BootProgress = {
    error: null,
    fakeMode: false,
    message: 'Starting the Vanta runtime…',
    phase: 'runtime.start',
    progress: 0.1,
    retryable: false,
    running: true,
    timestamp: now()
  }

  const set = (patch: Partial<BootProgress>) => {
    current = { ...current, ...patch, timestamp: now() }
    publish(current)
  }

  return {
    get: () => current,
    ready: () =>
      set({ error: null, message: 'Vanta runtime ready', phase: 'runtime.ready', progress: 1, running: false }),
    fail: (error: string) =>
      set({ error, message: error, phase: 'runtime.failed', progress: 1, retryable: false, running: false }),
    verifying: () => set({ message: 'Checking the Vanta runtime…', phase: 'runtime.verify', progress: 0.6 })
  }
}

export interface ConnectionDescriptor {
  baseUrl: string
  customWindowControls: boolean
  darwinMajor: number
  isFullscreen: boolean
  isMaximized: boolean
  logs: string[]
  mode: 'local'
  nativeOverlayWidth: number
  source: 'local'
  /** A placeholder. The boundary token never leaves the main process. */
  token: string
  windowButtonPosition: { x: number; y: number } | null
  /** No socket exists; the renderer's gateway takes this opaque value and ignores it. */
  wsUrl: string
}

export const BRIDGE_PLACEHOLDER_TOKEN = 'vanta-bridge'
export const LOCAL_GATEWAY_URL = 'vanta://local'
