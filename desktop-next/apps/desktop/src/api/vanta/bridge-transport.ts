import type { VantaTransport } from '@hermes/shared/vanta'

/** True in the Vanta shell, whose preload exposes `hermesDesktop.vanta`. */
export function hasVantaBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.hermesDesktop?.vanta)
}

/** The renderer's transport to the Vanta server: Electron main does the HTTP, so the renderer holds no token and sends no cross-origin request. */
export function bridgeTransport(): VantaTransport {
  const bridge = typeof window === 'undefined' ? undefined : window.hermesDesktop?.vanta

  if (!bridge) {
    throw new Error('The Vanta bridge is not available in this window. Start the app through the Vanta desktop shell.')
  }

  return {
    openEvents: (clientId, handlers) => bridge.openEvents(clientId, handlers),
    request: call => bridge.request(call)
  }
}
