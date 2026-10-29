import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { VantaApiRequest } from '@/global'

import { setApiRequestConnection, setApiRequestProfile, vantaApiAs } from '../client'
import { transcribeAudio } from '../system'
import { vantaRestShim } from './rest-shim'

const dataUrl = 'data:audio/webm;codecs=opus;base64,GkXfowAAAAAAAAAA'
const result = { text: 'Keep this recording with its original chat.', provider: 'local-whisper', model: 'tiny' }

beforeEach(() => {
  window.vantaDesktop = {}
  setApiRequestConnection(null)
  setApiRequestProfile(null)
})

afterEach(() => {
  delete window.vantaDesktop
  delete (window as { desktopBridge?: unknown }).desktopBridge
  setApiRequestConnection(null)
  setApiRequestProfile(null)
})

describe('Vanta local dictation transport', () => {
  it('maps recorded data URL and transcript fields to the existing local API', async () => {
    const send = vi.fn(async () => result)
    await expect(vantaRestShim({ method: 'POST', path: '/api/audio/transcribe', body: { data_url: dataUrl, mime_type: 'audio/webm;codecs=opus' } }, send))
      .resolves.toEqual({ ok: true, transcript: result.text, provider: 'local-whisper' })
    expect(send).toHaveBeenCalledExactlyOnceWith({ method: 'POST', path: '/api/voice/transcribe', body: { audioBase64: 'GkXfowAAAAAAAAAA', mimeType: 'audio/webm;codecs=opus' } })
  })

  it('keeps resolved recording ownership and timeout through the shim after an ambient switch', async () => {
    const api = vi.fn(async (_request: VantaApiRequest) => result)
    ;(window as { desktopBridge?: unknown }).desktopBridge = { api }
    setApiRequestConnection('other-gateway')
    setApiRequestProfile('other-profile')
    await expect(transcribeAudio(dataUrl, 'audio/webm;codecs=opus', { connectionId: 'local', profile: 'recording-owner' }))
      .resolves.toEqual({ ok: true, transcript: result.text, provider: 'local-whisper' })
    expect(api).toHaveBeenCalledExactlyOnceWith({ connectionId: 'local', profile: 'recording-owner', priority: 'foreground', timeoutMs: 180_000,
      method: 'POST', path: '/api/voice/transcribe', body: { audioBase64: 'GkXfowAAAAAAAAAA', mimeType: 'audio/webm;codecs=opus' }, upload: undefined })
  })

  it('does not add ambient owner tags to a resolved primary recording', async () => {
    const api = vi.fn(async (_request: VantaApiRequest) => result)
    ;(window as { desktopBridge?: unknown }).desktopBridge = { api }
    setApiRequestConnection('unrelated')
    setApiRequestProfile('unrelated')
    await transcribeAudio(dataUrl, undefined, { connectionId: null, profile: null })
    expect(api.mock.calls[0]?.[0]).not.toHaveProperty('connectionId')
    expect(api.mock.calls[0]?.[0]).not.toHaveProperty('profile')
    expect(api.mock.calls[0]?.[0]).toMatchObject({ path: '/api/voice/transcribe', body: { mimeType: 'audio/webm;codecs=opus' } })
  })

  it('also maps existing non-audio REST calls for resolved owners', async () => {
    const api = vi.fn(async () => { throw new Error('unmapped route') })
    ;(window as { desktopBridge?: unknown }).desktopBridge = { api }
    await expect(vantaApiAs({ connectionId: null, profile: null }, { path: '/api/profiles/active' }))
      .resolves.toEqual({ active: 'default', current: 'default' })
    expect(api).not.toHaveBeenCalled()
  })

  it.each([
    {},
    { data_url: 'https://example.invalid/recording.wav' },
    { data_url: 'data:text/plain;base64,AAAA' },
    { data_url: dataUrl, mime_type: 'audio/wav' }
  ])('rejects malformed or conflicting recording envelopes without sending audio: %j', async body => {
    const send = vi.fn(async () => result)
    await expect(vantaRestShim({ method: 'POST', path: '/api/audio/transcribe', body }, send)).rejects.toThrow(/audio|recording/i)
    expect(send).not.toHaveBeenCalled()
  })

  it('does not retry a rejected local transcription or manufacture a transcript', async () => {
    const send = vi.fn(async () => { throw new Error('503: local model is not installed') })
    await expect(vantaRestShim({ method: 'POST', path: '/api/audio/transcribe', body: { data_url: dataUrl } }, send)).rejects.toThrow('local model is not installed')
    expect(send).toHaveBeenCalledTimes(1)
    const malformed = vi.fn(async () => ({ ok: true }))
    await expect(vantaRestShim({ method: 'POST', path: '/api/audio/transcribe', body: { data_url: dataUrl } }, malformed)).rejects.toThrow()
  })

  it('leaves non-Vanta bridges and unsupported speech/warm-up routes unchanged', async () => {
    const send = vi.fn(async () => result)
    for (const route of ['/api/audio/speak', '/api/audio/stt-lease', '/api/audio/tts-lease']) {
      expect(vantaRestShim({ method: 'POST', path: route }, send)).toBeNull()
    }
    delete window.vantaDesktop
    const api = vi.fn(async () => ({ ok: true, transcript: 'other backend' }))
    ;(window as { desktopBridge?: unknown }).desktopBridge = { api }
    await transcribeAudio(dataUrl, undefined, { connectionId: null, profile: null })
    expect(api).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ path: '/api/audio/transcribe' }))
  })
})
