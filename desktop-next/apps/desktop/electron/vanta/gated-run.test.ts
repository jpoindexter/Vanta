import { describe, expect, it, vi } from 'vitest'
import { createGatedRunner } from './gated-run'
import type { NativeActionTarget } from './native-action-target'

describe('native gated request binding', () => {
  it('forwards the exact captured target and fixed owner on every request', async () => {
    const request = vi.fn(async () => ({ ok: true, status: 200, data: { ok: true, output: 'approved' } }))
    const target: NativeActionTarget = Object.freeze({ clientId: 'same-client', profile: 'writer', connectionId: 'local', generation: 3, lease: 8 })
    expect(await createGatedRunner(request)('fixture command', target)).toEqual({ ok: true, output: 'approved' })
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ profile: 'writer', clientId: 'same-client', connectionId: 'local', path: '/api/terminal', body: { command: 'fixture command' } }), target)
  })
})
