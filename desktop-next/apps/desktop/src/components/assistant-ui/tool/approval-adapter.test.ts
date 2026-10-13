import { describe, expect, it } from 'vitest'

import { summarizeApproval } from '@/components/chat/vanta/approval-summary'

import { approvalPayload, CHOICE_FOR_DECISION } from './approval-adapter'

const request = {
  command: 'npm test -- billing',
  description: 'run the billing tests',
  requestId: 'r1',
  sessionId: 's'
}

describe('approvalPayload', () => {
  it('presents a shell command as a bash approval with the command as its preview', () => {
    const summary = summarizeApproval(approvalPayload(request, true))

    expect(summary.headline).toBe('Run a command')
    expect(summary.preview?.text).toBe('npm test -- billing')
    expect(summary.lede).toBe('Run the billing tests.')
  })

  it('falls back to the description when the command is a synthetic plugin label', () => {
    const payload = approvalPayload(
      { ...request, command: '<edit> (plugin approval rule)', description: 'Edit notes.md' },
      false
    )

    expect(payload.request?.kind).toBe('generic')
    expect(payload.action).toBe('Edit notes.md')
  })

  it('offers remembering only when the gateway allows a permanent answer', () => {
    expect(approvalPayload(request, true).request?.canRemember).toBe(true)
    expect(approvalPayload(request, false).request?.canRemember).toBe(false)
  })
})

describe('CHOICE_FOR_DECISION', () => {
  it('maps the card decisions onto gateway choices', () => {
    expect(CHOICE_FOR_DECISION.allow).toBe('once')
    expect(CHOICE_FOR_DECISION.always).toBe('always')
    expect(CHOICE_FOR_DECISION.deny).toBe('deny')
  })
})
