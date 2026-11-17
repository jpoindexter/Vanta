import { expect, it, vi } from 'vitest'

import { type ChatMessage, textPart, toChatMessages } from '@/lib/chat-messages'

import { planConfirmedReload, planReload } from './rewind'

const row = (id: string, role: ChatMessage['role'], text: string): ChatMessage => ({ id, role, parts: [textPart(text)] })
const stopped = (): ChatMessage => ({
  ...row('failed', 'assistant', 'Stopped'),
  error: 'repeated_failure',
  errorSurface: {
    code: 'repeated_failure', layer: 'runtime', retryable: true,
    recovery: { actions: ['retry_failed_step'], checkpoint: { instruction: 'Research source A' } }
  }
})

it('retries the receipt-bound request, not an internal continuation prompt in saved history', () => {
  const messages = [{ ...row('original', 'user', 'Research source A'), rowId: 11 }, row('partial', 'assistant', 'Checked A'),
    row('internal', 'user', 'You returned nothing. State your result or call a tool.'), stopped()]
  const plan = planReload(messages, 'failed')
  expect(plan).toMatchObject({ text: 'Research source A', sourceText: 'Research source A', userIndex: 0,
    truncateMessageId: 'original' })
})

it('does not substitute an unrelated turn when the receipt-bound request is absent', () => {
  expect(planReload([row('other', 'user', 'An unrelated request'), stopped()], 'failed')).toBeNull()
})

it('retains nearest-user reload behavior for an ordinary answer without recovery metadata', () => {
  expect(planReload([row('original', 'user', 'Original'), row('next', 'user', 'Next'),
    row('answer', 'assistant', 'Done')], 'answer')).toMatchObject({ text: 'Next', userIndex: 1 })
})

it('matches the canonical persisted attachment request instead of its normalized display body', () => {
  const instruction = '@file:/tmp/source.pdf\n\nResearch source A'
  const messages = toChatMessages([{ role: 'user', content: instruction }])
  const failed = stopped()
  failed.errorSurface!.recovery!.checkpoint!.instruction = instruction
  expect(planReload([...messages, failed], 'failed')).toMatchObject({ text: instruction, sourceText: instruction })
})

it('does not confuse an attachment request with a later plain request sharing its caption', () => {
  const instruction = '@file:/tmp/source.pdf\n\nResearch source A'
  const messages = toChatMessages([{ role: 'user', content: instruction }, { role: 'user', content: 'Research source A' }])
  const failed = stopped()
  failed.errorSurface!.recovery!.checkpoint!.instruction = instruction
  expect(planReload([...messages, failed], 'failed')?.userIndex).toBe(0)
})

it('does not ask to discard internal continuation rows within the receipt-bound request', async () => {
  const confirm = vi.fn(async () => false)
  const messages = [row('original', 'user', 'Research source A'), row('internal', 'user', 'Internal continuation'), stopped()]
  expect(await planConfirmedReload(messages, 'failed', confirm)).toMatchObject({ text: 'Research source A' })
  expect(confirm).not.toHaveBeenCalled()
})

it('still asks before a recovery would discard a later human request', async () => {
  const confirm = vi.fn(async () => false)
  const messages = [row('original', 'user', 'Research source A'), row('partial', 'assistant', 'Checked A'), stopped(), row('later', 'user', 'Different work')]
  expect(await planConfirmedReload(messages, 'failed', confirm)).toBeNull()
  expect(confirm).toHaveBeenCalledOnce()
})

it.each(['@file:/tmp/source.pdf', '@image:/tmp/screenshot.png'])('retains an attachment-only request: %s', instruction => {
  const messages = toChatMessages([{ role: 'user', content: instruction }])
  const failed = stopped()
  failed.errorSurface!.recovery!.checkpoint!.instruction = instruction
  expect(planReload([...messages, failed], 'failed')?.text).toBe(instruction)
})

it('binds an expanded skill payload without replacing it with the displayed invocation', () => {
  const instruction = '[IMPORTANT: The user has invoked the "work" skill, indicating they want you to follow its instructions.\nThe full skill content is loaded below.]\n\nWork procedure\n\n[Skill directory: /tmp/work]'
  const messages = toChatMessages([{ role: 'user', content: instruction }])
  const failed = stopped()
  failed.errorSurface!.recovery!.checkpoint!.instruction = instruction
  expect(planReload([...messages, failed], 'failed')?.text).toBe(instruction)
})
