import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { alwaysLabel, alwaysNote, ApprovalCard } from './approval-card'
import type { ApprovalPayload, PermissionKind } from './approval-types'

afterEach(cleanup)

function payload(
  kind: PermissionKind,
  toolName: string,
  subject: string,
  extra: { fresh?: boolean; reason?: string } = {}
): ApprovalPayload {
  return {
    action: subject,
    id: 'a1',
    reason: extra.reason ?? '',
    request: {
      canRemember: !extra.fresh,
      fresh: extra.fresh,
      kind,
      reason: extra.reason ?? '',
      sections: [],
      subject,
      title: `${kind} permission request`,
      toolName
    },
    toolName
  }
}

const noop = () => undefined

describe('approval card copy per tool kind', () => {
  it('names a shell command and the shell-wide rule', () => {
    const approval = payload('bash', 'shell_cmd', 'npm test')

    render(<ApprovalCard approval={approval} onAnswer={noop} projectName="Acme" />)

    expect(screen.getByText('Run a command')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Always allow shell commands in this project' })).toBeTruthy()
    expect(screen.getByText(/Always covers every shell command Vanta runs in the Acme project/)).toBeTruthy()
  })

  it('names the file for an edit and saves an edit_file rule, never a shell one', () => {
    const approval = payload('file_edit', 'edit_file', 'brief.md')

    render(<ApprovalCard approval={approval} onAnswer={noop} projectName="Acme" />)

    expect(screen.getByText('Edit brief.md')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Always allow edit_file in this project' })).toBeTruthy()
    expect(screen.getByText(/Always covers every file edit \(edit_file, any file\) in the Acme project/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/shell command|Run a command/i)
  })

  it('names the file for a write and saves a write_file rule', () => {
    const approval = payload('file_write', 'write_file', 'notes.md')

    render(<ApprovalCard approval={approval} onAnswer={noop} />)

    expect(screen.getByText('Write notes.md')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Always allow write_file in this project' })).toBeTruthy()
    expect(screen.getByText(/Always covers every file write \(write_file, any file\) in this project/)).toBeTruthy()
  })

  it('offers no Always on a one-way action and says why', () => {
    const approval = payload('bash', 'shell_cmd', 'git push', { fresh: true, reason: 'publishes commits' })

    render(<ApprovalCard approval={approval} onAnswer={noop} />)

    expect(screen.queryByRole('button', { name: /Always allow/ })).toBeNull()
    expect(screen.getByText(/one-way action that can't be undone/)).toBeTruthy()
    expect(screen.getByText('Publishes commits.')).toBeTruthy()
  })

  it('names an MCP tool exactly as the saved rule does', () => {
    const approval = payload('generic', 'mcp__notes__create_page', 'Create page "Roadmap"')

    render(<ApprovalCard approval={approval} onAnswer={noop} projectName="Acme" />)

    expect(screen.getByRole('button', { name: 'Always allow mcp__notes__create_page in this project' })).toBeTruthy()
    expect(screen.getByText(/Always covers every use of mcp__notes__create_page in the Acme project/)).toBeTruthy()
  })

  it('has no Always label or note when the server will not remember the answer', () => {
    const approval = payload('file_edit', 'edit_file', 'brief.md')

    approval.request = { ...approval.request!, canRemember: false }

    expect(alwaysNote(approval)).toBe('')
    expect(alwaysLabel(approval)).toBe('Always allow edit_file in this project')
  })
})
