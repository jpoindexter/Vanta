import type { QueuedPromptEntry, RemoteQueueMeta } from '@/store/composer-queue'

// The server's durable turn queue as the composer sees it (gateway methods queue.list / queue.action, see
// api/vanta/handlers-queue.ts). The server owns order, text and status; this file only reshapes it.

export interface ServerQueueItem {
  failure?: { reason: string }
  id: string
  instruction: string
  intent: 'next' | 'steer'
  revision: number
  status: 'failed' | 'queued' | 'starting'
}

export interface ServerQueueSnapshot {
  items: ServerQueueItem[]
  revision: number
}

export type ServerQueueAction =
  | { action: 'cancel' | 'retry' | 'steer'; id: string; revision: number }
  | { action: 'edit'; id: string; message: string; revision: number }
  | { action: 'move'; direction: 'down' | 'up'; id: string; revision: number }

export interface ServerQueueConflict {
  code: string
  message: string
}

export const EMPTY_SERVER_QUEUE: ServerQueueSnapshot = { items: [], revision: 0 }

/** Plain words for why a change to a queued message was not applied. The list has already been refreshed. */
export function conflictText(conflict: ServerQueueConflict): string {
  switch (conflict.code) {
    case 'revision_conflict':
      return 'This queued message was changed somewhere else, so your change was not applied. The list now shows what it says.'
    case 'already_started':
      return 'This message already started running, so it can no longer be changed.'
    case 'not_found':
      return 'This message is no longer in the queue. It ran or was removed.'
    case 'not_retryable':
      return 'Only a message that did not send can be retried.'
    default:
      return conflict.message
  }
}

export function toQueuedEntry(item: ServerQueueItem): QueuedPromptEntry {
  const remote: RemoteQueueMeta = {
    ...(item.failure ? { failure: item.failure.reason } : {}),
    intent: item.intent,
    revision: item.revision,
    status: item.status
  }

  return { attachments: [], id: item.id, queuedAt: 0, remote, text: item.instruction }
}

/** A snapshot older than the one on screen (a slow poll overtaken by a change) must not roll the list back. */
export function newerSnapshot(current: ServerQueueSnapshot, next: ServerQueueSnapshot): ServerQueueSnapshot {
  return next.revision >= current.revision ? next : current
}

/** The message that will run next, if the queue is waiting for someone to start it. */
export function hasWaitingMessages(snapshot: ServerQueueSnapshot): boolean {
  return snapshot.items.some(item => item.status === 'queued')
}
