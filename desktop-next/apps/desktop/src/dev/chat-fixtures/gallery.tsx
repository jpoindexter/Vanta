import { type FC, useState } from 'react'

import { ApprovalCard } from '@/components/chat/vanta/approval-card'
import type { ApprovalPayload } from '@/components/chat/vanta/approval-types'
import { BlockedCard, FailureCard } from '@/components/chat/vanta/status-cards'

import { MAIN_HEIGHT, MAIN_WIDTH } from './params'

const COMMAND: ApprovalPayload = {
  action: 'Run npm test -- billing',
  id: 'g1',
  reason: 'verify the retry change',
  request: {
    canRemember: true,
    kind: 'bash',
    reason: 'verify the retry change',
    sections: [{ label: 'Command', tone: 'code', value: 'npm test -- billing' }],
    subject: 'npm test -- billing',
    title: 'Run a command'
  },
  toolName: 'shell_cmd'
}

const FILE_EDIT: ApprovalPayload = {
  action: 'Edit billing/retry.ts',
  id: 'g2',
  reason: 'add bounded exponential backoff',
  request: {
    canRemember: true,
    kind: 'file_edit',
    reason: 'add bounded exponential backoff',
    sections: [
      { label: 'Target file', value: 'billing/retry.ts' },
      { label: 'Preview', tone: 'code', value: '- await send(payload)\n+ await retry(send, payload)' },
      { label: 'Options', tone: 'muted', value: 'Runs inside the current project root.' }
    ],
    subject: 'billing/retry.ts',
    title: 'file_edit permission request'
  },
  toolName: 'edit_file'
}

const ONE_WAY: ApprovalPayload = {
  action: 'Run rm -rf build',
  id: 'g3',
  reason: 'remove the build folder',
  request: {
    canRemember: true,
    fresh: true,
    kind: 'bash',
    reason: 'remove the build folder',
    sections: [{ label: 'Command', tone: 'code', value: 'rm -rf build' }],
    subject: 'rm -rf build',
    title: 'Run a command'
  },
  toolName: 'shell_cmd'
}

const WEB: ApprovalPayload = {
  action: 'Open https://stripe.com/docs/webhooks',
  id: 'g4',
  reason: 'read the retry guidance',
  request: {
    canRemember: true,
    kind: 'web_fetch',
    reason: 'read the retry guidance',
    sections: [{ label: 'Target', value: 'https://stripe.com/docs/webhooks' }],
    subject: 'https://stripe.com/docs/webhooks',
    title: 'web_fetch permission request'
  },
  toolName: 'web_fetch'
}

const never = () => new Promise<void>(() => undefined)
const fail = () => Promise.reject(new Error('The server did not answer. Check activity before trying again.'))

const Label: FC<{ children: string }> = ({ children }) => (
  <p style={{ color: 'var(--vp-ink3)', fontSize: 12, margin: '18px 0 6px' }}>{children}</p>
)

/** Pure cards on their own, one per state the thread cannot easily reach. */
export const CardGallery: FC<{ width: number }> = ({ width }) => {
  const [lastAnswer, setLastAnswer] = useState('')

  return (
    <div
      data-fixture-main=""
      style={{ height: MAIN_HEIGHT * 2, overflow: 'auto', padding: '8px 16px 24px', width: MAIN_WIDTH[width] }}
    >
      <div data-vp="column" style={{ margin: '0 auto', maxWidth: 720 }}>
        <Label>Approval: command</Label>
        <ApprovalCard approval={COMMAND} onAnswer={decision => setLastAnswer(decision)} projectName="Vanta" />
        <Label>Approval: edit file, with preview and details</Label>
        <ApprovalCard approval={FILE_EDIT} onAnswer={() => undefined} projectName="Vanta" />
        <Label>Approval: one-way action (Always hidden, reason shown)</Label>
        <ApprovalCard approval={ONE_WAY} onAnswer={() => undefined} projectName="Vanta" />
        <Label>Approval: other tool, Always names the tool</Label>
        <ApprovalCard approval={WEB} onAnswer={() => undefined} projectName="Vanta" />
        <Label>Approval: waiting on the server after a click</Label>
        <ApprovalCard approval={COMMAND} onAnswer={never} projectName="Vanta" />
        <Label>Approval: decision failed, card stays</Label>
        <ApprovalCard approval={COMMAND} onAnswer={fail} projectName="Vanta" />
        <Label>Blocked question</Label>
        <BlockedCard
          actions={[
            { id: 'skip', label: 'Skip Acme', primary: true },
            { id: 'paste', label: 'Paste the page text' },
            { id: 'browser', label: 'Open browser to sign in' }
          ]}
          body="The Acme pricing page needs a login, so I cannot read it. Choose how to continue."
          onAction={id => setLastAnswer(id)}
          title="I need a source"
        />
        <Label>Failed run</Label>
        <FailureCard
          actions={[
            { id: 'retry', label: 'Retry the step', primary: true },
            { id: 'output', label: 'View output' }
          ]}
          body="3 of 41 billing tests failed after the edit. Partial output is kept. Nothing was committed."
          onAction={id => setLastAnswer(id)}
          title="The tests failed"
        />
        <output data-testid="gallery-last-answer" hidden>
          {lastAnswer}
        </output>
      </div>
    </div>
  )
}
