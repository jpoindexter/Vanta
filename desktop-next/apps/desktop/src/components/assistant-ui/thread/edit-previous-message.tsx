import { useAuiState, useThreadRuntime } from '@assistant-ui/react'
import { type FC, useCallback } from 'react'

import { triggerHaptic } from '@/lib/haptics'
import { notifyThreadEditOpen } from '@/store/thread-scroll'

// "Edit message" for a safety refusal: opens the preceding user message in
// the edit composer, the same runtime call the bubble's own click performs
// (user-message.tsx ActionBarPrimitive.Edit). Retry would reproduce the
// refusal; changing the words is the only way forward.
export const EditPreviousMessageAction: FC<{ label: string }> = ({ label }) => {
  const threadRuntime = useThreadRuntime()

  const previousUserMessageId = useAuiState(s => {
    const messages = s.thread.messages
    const index = messages.findIndex(message => message.id === s.message.id)

    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return messages[i].id
      }
    }

    return null
  })

  const beginEdit = useCallback(() => {
    if (!previousUserMessageId) {
      return
    }

    triggerHaptic('selection')
    notifyThreadEditOpen()
    threadRuntime.getMessageById(previousUserMessageId).composer.beginEdit()
  }, [previousUserMessageId, threadRuntime])

  if (!previousUserMessageId) {
    return null
  }

  return (
    <button className="aui-error-action" onClick={beginEdit} type="button">
      {label}
    </button>
  )
}
