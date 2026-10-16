import { vi } from 'vitest'

import type { VantaApiRequest } from '@/global'

/** Install a fake `window.desktopBridge.api`, the preload bridge every REST helper sends through. */
export function installRestBridge(answer: (request: VantaApiRequest) => object) {
  const api = vi.fn(async (request: VantaApiRequest) => answer(request))

  Object.defineProperty(window, 'desktopBridge', { configurable: true, value: { api } })

  return api
}
