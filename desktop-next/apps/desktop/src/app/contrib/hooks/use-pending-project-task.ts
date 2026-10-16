import { useEffect } from 'react'

import { notify } from '@/store/notifications'

interface PendingTask {
  draft: { folder: string; prompt: string }
  id: string
}

interface PendingBridge {
  acknowledgePendingProjectTask?: (id: string) => Promise<boolean>
  readPendingProjectTask?: () => Promise<null | PendingTask>
}

const folderName = (folder: string): string => folder.replace(/\/+$/, '').split('/').pop() || folder

/**
 * A task started for another project moved the runtime and reloaded the window. When the window comes back in that
 * project, this starts the chat with the words that were typed, then tells the shell it was picked up (so it never
 * starts twice).
 */
export function usePendingProjectTask(startTask: (text: string) => Promise<unknown>): void {
  useEffect(() => {
    const bridge = window.vantaDesktop as PendingBridge | undefined

    if (!bridge?.readPendingProjectTask) {
      return
    }

    let cancelled = false

    void bridge
      .readPendingProjectTask()
      .then(async pending => {
        if (!pending || cancelled) {
          return
        }

        await startTask(pending.draft.prompt)
        await bridge.acknowledgePendingProjectTask?.(pending.id)
        notify({ kind: 'info', message: `Started your task in ${folderName(pending.draft.folder)}.`, title: 'Project changed' })
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
    // Once per window load: the pending task belongs to this load of the app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
