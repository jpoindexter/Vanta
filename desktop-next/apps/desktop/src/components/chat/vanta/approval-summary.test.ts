import { describe, expect, it } from 'vitest'

import { summarizeApproval } from './approval-summary'
import {
  type ApprovalPayload,
  parseApprovalPayload,
  type PermissionKind,
  type PermissionSection
} from './approval-types'

function approval(
  kind: PermissionKind,
  subject: string,
  sections: PermissionSection[],
  extra: Partial<ApprovalPayload> = {}
): ApprovalPayload {
  return {
    action: extra.action ?? subject,
    id: 'a1',
    reason: extra.reason ?? '',
    request: { kind, reason: extra.reason ?? '', sections, subject, title: `${kind} permission request` },
    toolName: 'tool'
  }
}

describe('summarizeApproval', () => {
  it('names a file edit by the exact file and drops the repeated target and change rows', () => {
    const result = summarizeApproval(
      approval(
        'file_edit',
        'brief.md',
        [
          { label: 'Target file', tone: 'code', value: 'brief.md' },
          { label: 'Change', tone: 'danger', value: 'Modifies existing file content.' }
        ],
        { reason: 'modifying existing file content' }
      )
    )

    expect(result.headline).toBe('Edit brief.md')
    expect(result.lede).toBe('Modifying existing file content.')
    expect(result.preview).toBeUndefined()
    expect(result.details).toEqual([])
  })

  it('promotes the diff preview and keeps unrelated detail rows', () => {
    const result = summarizeApproval(
      approval(
        'file_write',
        'notes.md',
        [
          { label: 'Target file', value: 'notes.md' },
          { label: 'Write mode', value: 'Overwrites existing content.' },
          { label: 'Preview', tone: 'code', value: '- old\n+ new' }
        ],
        { action: 'Overwrite existing file notes.md' }
      )
    )

    expect(result.headline).toBe('Overwrite notes.md')
    expect(result.preview).toEqual({ label: 'Preview', text: '- old\n+ new' })
    expect(result.details).toEqual([])
  })

  it('shows the shell command as the preview and keeps the options row', () => {
    const result = summarizeApproval(
      approval('bash', 'rm -rf build', [
        { label: 'Command', tone: 'code', value: 'rm -rf build' },
        { label: 'Options', tone: 'muted', value: 'Runs inside the current project root.' }
      ])
    )

    expect(result.headline).toBe('Run a command')
    expect(result.preview?.text).toBe('rm -rf build')
    expect(result.details.map(section => section.label)).toEqual(['Options'])
  })

  it('names the host for web fetches and keeps the full address as the preview', () => {
    const result = summarizeApproval(
      approval('web_fetch', 'https://example.com/a?b=1', [{ label: 'Target', value: 'https://example.com/a?b=1' }])
    )

    expect(result.headline).toBe('Open example.com')
    expect(result.preview).toEqual({ label: 'Address', text: 'https://example.com/a?b=1' })
  })

  it('falls back to the plain action for unknown kinds and never emits an empty lede sentence', () => {
    const generic = summarizeApproval(
      approval('generic', 'Send the weekly digest', [{ label: 'Action', value: 'Send the weekly digest' }], {
        reason: 'send the weekly digest'
      })
    )

    expect(generic.headline).toBe('generic')
    expect(generic.lede).toBe('Send the weekly digest.')
    expect(summarizeApproval({ action: 'Do thing', id: 'b', reason: '' }).lede).toBe('')
  })
})

describe('parseApprovalPayload', () => {
  it('keeps a well-formed server payload', () => {
    const parsed = parseApprovalPayload({
      action: 'Run npm test',
      id: 'a1',
      reason: 'verify',
      request: { canRemember: true, kind: 'bash', reason: 'verify', sections: [], subject: 'npm test', title: 't' },
      toolName: 'shell_cmd'
    })

    expect(parsed?.request?.kind).toBe('bash')
    expect(parsed?.request?.canRemember).toBe(true)
  })

  it('rejects a payload without an id and an action', () => {
    expect(parseApprovalPayload({ action: 'x' })).toBeNull()
    expect(parseApprovalPayload('nope')).toBeNull()
  })

  it('falls back to the generic kind and drops malformed sections', () => {
    const parsed = parseApprovalPayload({
      action: 'x',
      id: '1',
      request: { kind: 'martian', sections: [{ label: 1 }, { label: 'ok', value: 'v' }] }
    })

    expect(parsed?.request?.kind).toBe('generic')
    expect(parsed?.request?.sections).toEqual([{ label: 'ok', tone: undefined, value: 'v' }])
  })
})
