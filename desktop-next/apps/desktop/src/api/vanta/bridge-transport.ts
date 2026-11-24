import type { VantaOwnerRoute, VantaTransport } from '@vanta/shared/vanta'
import { z } from 'zod'

const profileName = z.string().trim().min(1).max(64)

function routeFromUrl(raw: string): VantaOwnerRoute {
  const url = new URL(raw)
  if (url.protocol !== 'vanta:' || url.host !== 'local' || url.username || url.password ||
      !['', '/'].includes(url.pathname) || url.hash ||
      [...url.searchParams.keys()].some(key => key !== 'profile') || url.searchParams.getAll('profile').length > 1) {
    throw new Error('The Vanta gateway connection has an unsupported owner route.')
  }
  const profile = url.searchParams.get('profile')
  return { connectionId: 'local', ...(profile === null ? {} : { profile: profileName.parse(profile) }) }
}

/** True in the Vanta shell, whose preload exposes `desktopBridge.vanta`. */
export function hasVantaBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.desktopBridge?.vanta)
}

/** The renderer's transport to the Vanta server: Electron main does the HTTP, so the renderer holds no token and sends no cross-origin request. */
export function bridgeTransport(): VantaTransport & { bindOwner: (url: string) => void } {
  const bridge = typeof window === 'undefined' ? undefined : window.desktopBridge?.vanta

  if (!bridge) {
    throw new Error('The Vanta bridge is not available in this window. Start the app through the Vanta desktop shell.')
  }

  let owner: VantaOwnerRoute | undefined
  return {
    bindOwner: url => {
      const selected = routeFromUrl(url)
      if (owner && JSON.stringify(selected) !== JSON.stringify(owner)) {
        throw new Error('A connected gateway cannot change its owner. Open the selected profile through its own gateway.')
      }
      owner = selected
    },
    openEvents: (clientId, handlers) => bridge.openEvents(clientId, handlers, owner),
    request: call => {
      if (owner && ((call.connectionId && call.connectionId !== owner.connectionId) ||
          (call.profile && call.profile !== owner.profile))) {
        return Promise.reject(new Error('The request owner does not match this gateway.'))
      }
      return bridge.request({ ...call, ...owner })
    }
  }
}
