import { describe, expect, it } from 'vitest'

import { conflictText, hasWaitingMessages, newerSnapshot, type ServerQueueItem, toQueuedEntry } from './server-queue-model'

const item = (extra: Partial<ServerQueueItem> = {}): ServerQueueItem => ({
  id: 'a',
  instruction: 'Run the tests',
  intent: 'next',
  revision: 3,
  status: 'queued',
  ...extra
})

describe('conflictText', () => {
  it.each([
    ['revision_conflict', 'changed somewhere else'],
    ['already_started', 'already started running'],
    ['not_found', 'no longer in the queue'],
    ['not_retryable', 'Only a message that did not send']
  ])('explains %s in plain words', (code, words) => {
    expect(conflictText({ code, message: 'server text' })).toContain(words)
  })

  it('passes an unknown reason through as the server worded it', () => {
    expect(conflictText({ code: 'something_new', message: 'The queue is locked.' })).toBe('The queue is locked.')
  })
})

describe('toQueuedEntry', () => {
  it('carries the revision, status, intent and failure reason with the text', () => {
    expect(toQueuedEntry(item({ failure: { reason: 'Task stopped after repeated failures.' }, status: 'failed' }))).toMatchObject({
      attachments: [],
      id: 'a',
      remote: { failure: 'Task stopped after repeated failures.', intent: 'next', revision: 3, status: 'failed' },
      text: 'Run the tests'
    })
  })
})

describe('newerSnapshot', () => {
  it('does not let a slow poll roll the list back', () => {
    const shown = { items: [item({ id: 'new' })], revision: 9 }

    expect(newerSnapshot(shown, { items: [item({ id: 'old' })], revision: 8 })).toBe(shown)
    expect(newerSnapshot(shown, { items: [], revision: 9 }).items).toEqual([])
  })
})

describe('hasWaitingMessages', () => {
  it('is true only when a message is waiting to start', () => {
    expect(hasWaitingMessages({ items: [item({ status: 'failed' }), item({ status: 'starting' })], revision: 1 })).toBe(false)
    expect(hasWaitingMessages({ items: [item({ status: 'failed' }), item()], revision: 1 })).toBe(true)
    expect(hasWaitingMessages({ items: [], revision: 0 })).toBe(false)
  })
})
