import { ActionBarPrimitive, useAuiState } from '@assistant-ui/react'
import { type FC, useCallback } from 'react'

import { requestComposerFocus, requestComposerInsert } from '@/app/chat/composer/focus'
import { EditPreviousMessageAction } from '@/components/assistant-ui/thread/edit-previous-message'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { RefreshCwIcon } from '@/lib/icons'
import { checkpointPrompt, type RunRecovery } from '@/lib/run-recovery'
import { DESKTOP_BUTTON_ACTIONS, recordAction } from '@/store/desktop-metrics'
import { notify } from '@/store/notifications'

/** "Start from checkpoint": puts the saved request and partial output in the message box for the user to send. */
const CheckpointAction: FC<{ label: string; recovery: RunRecovery }> = ({ label, recovery }) => {
  const copy = useI18n().t.vantaShell.runRecovery

  const start = useCallback(() => {
    triggerHaptic('selection')
    requestComposerInsert(checkpointPrompt(recovery), { target: 'main' })
    requestComposerFocus('main')
    notify({ kind: 'info', message: copy.checkpointReady })
  }, [copy.checkpointReady, recovery])

  return (
    <button className="aui-error-action" data-testid="run-recovery-checkpoint" onClick={start} type="button">
      {label}
    </button>
  )
}

/**
 * The recovery the server saved for a failed or stopped run, as the error card's buttons. Each button shows only
 * when the server offered that action. Only the newest message offers them: an older failure's request is no
 * longer the one to resume.
 */
export const RunRecoveryActions: FC<{ recovery: RunRecovery }> = ({ recovery }) => {
  const copy = useI18n().t.vantaShell.runRecovery
  const isLast = useAuiState(s => s.message.isLast)
  const offers = (action: RunRecovery['actions'][number]) => recovery.actions.includes(action)

  if (!isLast) {
    return null
  }

  return (
    <div aria-label={copy.actionsLabel} className="vp-acts" data-vp="failure-actions" role="group">
      {offers('retry_failed_step') && (
        <ActionBarPrimitive.Reload asChild>
          <button
            className="aui-error-action"
            data-testid="run-recovery-retry"
            data-tone="primary"
            onClick={() => {
              triggerHaptic('submit')
              recordAction(DESKTOP_BUTTON_ACTIONS.messageRetry, 'click')
            }}
            type="button"
          >
            <RefreshCwIcon className="size-3" />
            {copy.retryStep}
          </button>
        </ActionBarPrimitive.Reload>
      )}
      {offers('edit_request') && <EditPreviousMessageAction instruction={recovery.checkpoint?.instruction} label={copy.editRequest} />}
      {offers('start_from_checkpoint') && recovery.checkpoint && (
        <CheckpointAction label={copy.startFromCheckpoint} recovery={recovery} />
      )}
    </div>
  )
}
