import type { QueuedPromptEntry } from '@/store/composer-queue'

import type { ServerQueue } from './use-server-queue'

// What the composer's queue gestures mean when the entry is the server's saved queue item (entry.remote).

export const remoteEntryOf = (remote: ServerQueue | undefined, id: string): QueuedPromptEntry | undefined =>
  remote?.entries.find(entry => entry.id === id)

/** Save an edited message. The change quotes the revision the edit started from, so a change made elsewhere is refused. */
export function saveRemoteEdit(remote: ServerQueue, id: string, message: string, revision: number): Promise<boolean> {
  return remote.act({ action: 'edit', id, message, revision })
}

/**
 * "Send now" / double-Enter on a saved message. Running turn: it takes the next turn (the server never
 * interrupts a running instruction to reach the queue). Idle: it goes to the front and the queue is run.
 */
export async function sendRemoteNow(remote: ServerQueue, entry: QueuedPromptEntry, busy: boolean): Promise<boolean> {
  const meta = entry.remote

  if (!meta || meta.status === 'starting') {
    return false
  }

  if (meta.status === 'failed') {
    return remote.act({ action: 'retry', id: entry.id, revision: meta.revision }).then(ok => (ok && !busy ? remote.run() : ok))
  }

  const moved = meta.intent === 'steer' ? true : await remote.act({ action: 'steer', id: entry.id, revision: meta.revision })

  return moved && !busy ? remote.run() : moved
}

export const steerRemote = (remote: ServerQueue, entry: QueuedPromptEntry): Promise<boolean> =>
  entry.remote ? remote.act({ action: 'steer', id: entry.id, revision: entry.remote.revision }) : Promise.resolve(false)

export const cancelRemote = (remote: ServerQueue, entry: QueuedPromptEntry): Promise<boolean> =>
  entry.remote ? remote.act({ action: 'cancel', id: entry.id, revision: entry.remote.revision }) : Promise.resolve(false)
