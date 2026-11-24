import { SLASH_COMMAND_RE } from '@vanta/shared'
import { useLayoutEffect, useRef } from 'react'
import { usePaneVisible } from '@/components/pane-shell/pane-visibility'
import type { ComposerAttachment } from '@/store/composer'
import { enqueueQueuedPrompt, getQueuedPrompts } from '@/store/composer-queue'
import { hasBlockingPromptRequest } from '@/store/prompts'
import { onComposerSubmitRequest } from '../focus'
import { useComposerScope, useComposerSurfaceId } from '../scope'
import type { UseComposerSubmitArgs } from './use-composer-submit'

interface ExternalSubmitOptions extends Pick<UseComposerSubmitArgs,
  'activeQueueSessionKeyRef' | 'busy' | 'inputDisabled' | 'onSteer' | 'onSteerHidden' | 'queuedPrompts' | 'sessionId'> {
  dispatchSubmit: (text: string, attachments?: ComposerAttachment[], displayKind?: 'hidden') => void
}

function selectSteer(current: ExternalSubmitOptions, text: string, displayKind?: 'hidden') {
  if (displayKind) return current.onSteerHidden
  if (current.onSteer && !hasBlockingPromptRequest(current.sessionId) && text.trim() && !SLASH_COMMAND_RE.test(text.trim())) {
    return current.onSteer
  }
}

function routeExternalSubmit(current: ExternalSubmitOptions, text: string, displayKind?: 'hidden'): void {
  const key = current.activeQueueSessionKeyRef.current
  const waiting = current.queuedPrompts.length > 0 || getQueuedPrompts(key).length > 0
  if (!current.busy && !waiting) {
    current.dispatchSubmit(text, undefined, displayKind)
    return
  }
  // External requests never consume the user's unsent words or attachments.
  const enqueue = () => void enqueueQueuedPrompt(key, { text, attachments: [], ...(displayKind ? { displayKind } : {}) })
  if (waiting) {
    enqueue()
    return
  }
  const steer = selectSteer(current, text, displayKind)
  if (!steer) {
    enqueue()
    return
  }
  void Promise.resolve(steer(text)).then(accepted => { if (!accepted) enqueue() }).catch(enqueue)
}

/** Kept-alive panes cannot claim a request intended for another visible surface. */
export function useExternalComposerSubmit(options: ExternalSubmitOptions): void {
  const paneVisible = usePaneVisible()
  const scope = useComposerScope()
  const surfaceId = useComposerSurfaceId()
  const current = useRef(options)
  current.current = options
  useLayoutEffect(() => onComposerSubmitRequest(request => {
    if (request.target === scope.target && surfaceId !== null && request.surfaceId === surfaceId &&
      paneVisible && !options.inputDisabled) {
      routeExternalSubmit(current.current, request.text, request.displayKind)
    }
  }), [options.activeQueueSessionKeyRef, options.inputDisabled, paneVisible, scope.target, options.sessionId, surfaceId])
}
