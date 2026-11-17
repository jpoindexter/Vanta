import { z } from 'zod'

import type { AudioTranscriptionResponse } from '@/types/desktop'

import { type ShimCall, type ShimRoute, text } from './shim-core'

const transcriptSchema = z.object({ text: z.string().min(1), provider: z.string().min(1) })
const baseMime = (mime: string): string => mime.split(';')[0]!.trim().toLowerCase()

async function transcribe({ body, send }: ShimCall): Promise<AudioTranscriptionResponse> {
  const recording = /^data:(audio\/[^,]+);base64,([\s\S]+)$/.exec(text(body.data_url))
  if (!recording) throw new Error('Provide a base64-encoded audio recording.')

  const mimeType = body.mime_type === undefined ? recording[1]! : body.mime_type
  if (typeof mimeType !== 'string' || baseMime(mimeType) !== baseMime(recording[1]!)) {
    throw new Error('The recording and audio type must match.')
  }

  // The existing backend owns byte limits, canonical base64 and audio-format validation.
  const result = transcriptSchema.parse(await send({
    method: 'POST',
    path: '/api/voice/transcribe',
    body: { audioBase64: recording[2], mimeType }
  }))
  return { ok: true, transcript: result.text, provider: result.provider }
}

export const audioRoutes: readonly ShimRoute[] = [
  { handle: transcribe, method: 'POST', path: /^\/api\/audio\/transcribe$/ }
]
