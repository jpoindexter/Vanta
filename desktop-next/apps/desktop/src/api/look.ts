import { rawApi } from './client'

export type LookMode = 'marquee' | 'screen' | 'window'

export interface LookImage {
  dataBase64: string
  mime: string
  name: string
}

export type LookResult = { images: LookImage[]; status: 'captured' } | { status: 'cancelled' }

/**
 * Asks the Vanta server to take a screenshot (macOS `screencapture`). Cancelling the marquee or window picker is a
 * normal outcome, not an error. A denied permission or an oversized capture rejects with the server's recovery text.
 */
export function captureLook(mode: LookMode): Promise<LookResult> {
  return rawApi<LookResult>({ body: { mode }, method: 'POST', path: '/api/look' })
}
