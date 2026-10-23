import { afterEach, describe, expect, it, vi } from 'vitest'
import { controlWorkflowRun } from './workflow-runs'
import { rawApi } from './client'
import { dropForegroundClient, noteForegroundClient } from './vanta/foreground-client'
import { APPROVAL_TIMEOUT_MS } from './vanta/shim-core'

vi.mock('./client', () => ({ rawApi: vi.fn().mockResolvedValue({ status: 'running' }) }))
afterEach(() => { vi.clearAllMocks(); dropForegroundClient('approval-chat'); })

describe('workflow control routing', () => {
  it('routes resume approvals to the existing foreground chat and allows decision time', async () => {
    noteForegroundClient('approval-chat')
    await controlWorkflowRun('safe:checkpoint', 'retry')
    expect(rawApi).toHaveBeenCalledWith({ body: { action: 'retry' }, clientId: 'approval-chat',
      method: 'POST', path: '/api/workflow-runs/safe%3Acheckpoint', timeoutMs: APPROVAL_TIMEOUT_MS })
  })

  it.each(['pause', 'cancel'] as const)('keeps %s on the ordinary request timeout', async (action) => {
    await controlWorkflowRun('stop-me', action)
    expect(rawApi).toHaveBeenCalledWith({ body: { action }, method: 'POST', path: '/api/workflow-runs/stop-me' })
  })
})
