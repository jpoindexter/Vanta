import { useAuiState, useThreadRuntime } from '@assistant-ui/react'
import type { FC } from 'react'

import { requestComposerSubmit } from '@/app/chat/composer/focus'
import { useComposerScope } from '@/app/chat/composer/scope'
import { triggerHaptic } from '@/lib/haptics'
import { setToolDisclosureOpen } from '@/store/tool-view'

import { toolCallFailed, toolEntryDisclosureId } from './fallback-model'

/** Stop sits on the live line so the run can be halted where it is being watched. */
export const StopStepButton: FC = () => {
  const thread = useThreadRuntime()

  return (
    <button
      className="vp-btn vp-btn--inline"
      data-vp="running-stop"
      onClick={() => {
        triggerHaptic('cancel')
        thread.cancelRun()
      }}
      type="button"
    >
      Stop
    </button>
  )
}

/** A failed step keeps its own Retry: it asks the agent to run that step again. */
export const RetryStepButton: FC<{ title: string }> = ({ title }) => {
  const scope = useComposerScope()

  return (
    <button
      className="vp-btn vp-btn--inline"
      onClick={() => {
        triggerHaptic('submit')
        requestComposerSubmit(`Retry the step that failed: ${title}`, { target: scope.target })
      }}
      type="button"
    >
      Retry
    </button>
  )
}

/** Opens the output of the last failed step in place; the step row stays where it was. */
export const ViewOutputButton: FC = () => {
  const target = useAuiState(state => {
    const failed = state.message.parts.findLast(part => part.type === 'tool-call' && toolCallFailed(part))

    return failed?.type === 'tool-call' ? toolEntryDisclosureId(state.message.id, failed) : ''
  })

  if (!target) {
    return null
  }

  return (
    <button
      className="vp-btn"
      onClick={() => {
        setToolDisclosureOpen(target, true)
        document
          .querySelector(`[data-tool-row][data-disclosure-id="${CSS.escape(target)}"]`)
          ?.scrollIntoView({ block: 'nearest' })
      }}
      type="button"
    >
      View output
    </button>
  )
}
