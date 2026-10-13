'use client'

import { useAuiState } from '@assistant-ui/react'
import { useStore } from '@nanostores/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { createContext, type FC, useCallback, useContext, useMemo, useRef } from 'react'

import { useSessionView } from '@/app/chat/session-view'
import { SCAFFOLD_LABEL_CLASS, ScaffoldRow } from '@/components/chat/scaffold-row'
import { ApprovalCard as VantaApprovalCard } from '@/components/chat/vanta/approval-card'
import { CardStack, type CardStackAction } from '@/components/ui/card-stack'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { releaseApprovalKey } from '@/lib/keybinds/approval-keys'
import { cn } from '@/lib/utils'
import { $gateway } from '@/store/gateway'
import { reconnectAction } from '@/store/gateway-reconnect'
import { notifyError } from '@/store/notifications'
import {
  answerApproval,
  type ApprovalRequest,
  clearApprovalRequest,
  replayPendingApproval,
  sessionApprovalRequests,
  sessionApprovalStackSize
} from '@/store/prompts'
import { $showToolActivity } from '@/store/tool-activity'
import { setToolDisclosureOpen } from '@/store/tool-view'

import { isApprovalActivity } from './approval-activity'
import { type ApprovalChoice, approvalPayload, CHOICE_FOR_DECISION } from './approval-adapter'
import { toolEntryDisclosureId } from './fallback-model/targets'
import { isToolCallPart, summarizeToolRun } from './run-summary'

export const ApprovalPlacementContext = createContext<'inline' | 'floating'>('inline')

// One transcript-owned host for the session. Execution rows never mount,
// register or re-home this queue, including the first delayed tool.start.
export const PendingApprovalStack: FC = () => {
  const { t } = useI18n()
  const placement = useContext(ApprovalPlacementContext)
  const sessionId = useStore(useSessionView().$runtimeId)
  const requests = useStore(useMemo(() => sessionApprovalRequests(sessionId), [sessionId]))
  const total = useStore(useMemo(() => sessionApprovalStackSize(sessionId), [sessionId]))
  const reduced = useReducedMotion()

  return (
    <motion.section
      animate={{ paddingBlock: requests.length ? 8 : 0 }}
      aria-label={t.assistant.approval.jumpToApproval}
      className={cn('min-w-0', placement === 'floating' ? 'sticky bottom-4 z-10 mt-auto w-full self-center' : 'w-full')}
      data-approval-placement={placement}
      data-approval-stack=""
      data-session-id={sessionId ?? undefined}
      data-slot="tool-approval-stack"
      initial={false}
      transition={reduced || requests.length ? { duration: 0 } : { duration: 0.22, ease: 'easeInOut' }}
    >
      <ApprovalActivity floating={placement === 'floating'} visible={requests.length > 0} />
      <ApprovalQueue floating={placement === 'floating'} requests={requests} total={total} />
    </motion.section>
  )
}

function ApprovalActivity({ floating, visible }: { floating: boolean; visible: boolean }) {
  const { t } = useI18n()
  const reduced = useReducedMotion()
  const showToolActivity = useStore($showToolActivity)

  const summary = useAuiState(state => {
    if (!visible) {
      return ''
    }

    const start = state.thread.messages.findLastIndex(message => message.role === 'user')

    const tools = state.thread.messages
      .slice(start + 1)
      .filter(message => message.role === 'assistant')
      .flatMap(message => message.content.filter(isToolCallPart).filter(isApprovalActivity))

    return tools.length
      ? summarizeToolRun(
          tools,
          tools.some(tool => tool.result === undefined)
        )
      : ''
  })

  const disclosureIds = useAuiState(state => {
    if (!visible) {
      return ''
    }

    const start = state.thread.messages.findLastIndex(message => message.role === 'user')

    return state.thread.messages
      .slice(start + 1)
      .filter(message => message.role === 'assistant')
      .flatMap(message =>
        message.content
          .filter(isToolCallPart)
          .filter(isApprovalActivity)
          .map(tool => toolEntryDisclosureId(message.id, tool))
      )
      .join('\n')
  })

  // The pending approval stays. The run summary beside it is tool feed and
  // follows display.tool_progress alongside the other process rows.
  if (!showToolActivity) {
    return null
  }

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          animate={{ height: 'auto', opacity: 1 }}
          className="overflow-hidden"
          exit={{ height: 0, opacity: 0 }}
          initial={{ height: 0, opacity: 0 }}
          key="activity"
          transition={{ duration: reduced ? 0 : 0.22, ease: 'easeInOut' }}
        >
          <div
            className={cn('mb-1 min-w-0', floating && 'rounded bg-(--ui-chat-surface-background)')}
            data-approval-activity=""
            data-glass-opaque={floating ? '' : undefined}
            data-tool-summary=""
          >
            <ScaffoldRow
              onToggle={
                disclosureIds
                  ? () => {
                      for (const id of disclosureIds.split('\n')) {
                        setToolDisclosureOpen(id, true)
                      }
                    }
                  : undefined
              }
              open={false}
            >
              <span className={cn(SCAFFOLD_LABEL_CLASS, 'truncate')}>
                {summary || t.assistant.approval.jumpToApproval}
              </span>
            </ScaffoldRow>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

async function sendApproval(request: ApprovalRequest, choice: ApprovalChoice) {
  const gateway = $gateway.get()

  if (!gateway) {
    throw new Error('Gateway disconnected')
  }

  if (
    !sessionApprovalRequests(request.sessionId)
      .get()
      .some(item => item.requestId === request.requestId)
  ) {
    return
  }

  await answerApproval(gateway, request, choice)
  triggerHaptic(choice === 'deny' ? 'cancel' : 'submit')
  clearApprovalRequest(request.sessionId, request.requestId)
  void replayPendingApproval(gateway, request.sessionId).catch(() => undefined)
}

export function ApprovalQueue({
  requests,
  total,
  floating = false
}: {
  requests: ApprovalRequest[]
  total: number
  floating?: boolean
}) {
  const { t } = useI18n()

  return (
    <CardStack
      getKey={request => request.requestId ?? 'legacy'}
      items={requests}
      onSwipe={(request, _side, action) => {
        void action
          .depart(() => sendApproval(request, 'deny'))
          .catch(error => {
            releaseApprovalKey()
            notifyError(error, t.assistant.approval.sendFailed)
          })
      }}
      surfaceClassName={cn('rounded-xl', floating && 'shadow-nous')}
      swipeDirections={['left']}
    >
      {(request, action) => (
        <ApprovalCard
          position={total - requests.length + requests.indexOf(request) + 1}
          request={request}
          stack={action}
          total={total}
        />
      )}
    </CardStack>
  )
}

const projectNameOf = (cwd: string): string | undefined =>
  cwd
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .pop() || undefined

interface ApprovalCardProps {
  request: ApprovalRequest
  total: number
  position: number
  stack: CardStackAction
}

const ApprovalCard: FC<ApprovalCardProps> = ({ request, total, position, stack }) => {
  const { t } = useI18n()
  const copy = t.assistant.approval
  const gateway = useStore($gateway)
  const projectName = projectNameOf(useStore(useSessionView().$cwd))
  const submittingRef = useRef(false)

  const present = stack.active
  // Answering with the pointer moves focus onto the card, and the card then
  // unmounts, which parks focus on <body> — where type-to-focus routes the next
  // keystrokes into the chat composer. For a computer_use flow the agent may
  // have just aimed its input at another pane (terminal, preview), so the
  // approval hands focus back to whatever held it before the press (#113839).
  const focusOrigin = useRef<HTMLElement | null>(null)
  const cardRef = useRef<HTMLElement | null>(null)

  const rememberFocusOrigin = useCallback(() => {
    const active = document.activeElement

    if (active instanceof HTMLElement && active !== document.body && !cardRef.current?.contains(active)) {
      focusOrigin.current = active
    }
  }, [])

  const restoreFocusOrigin = useCallback(() => {
    const origin = focusOrigin.current
    const active = document.activeElement

    focusOrigin.current = null

    // Only when the answer itself is what stranded focus — never steal from a
    // surface the user moved to while the reply was in flight.
    if (origin?.isConnected && (!active || active === document.body || cardRef.current?.contains(active))) {
      origin.focus({ preventScroll: true })
    }
  }, [])

  // false when the backend won't honor a permanent allow → hide "Always allow".
  const choices = request.choices ?? (request.smartDenied ? ['once', 'deny'] : undefined)
  const canRemember = choices ? choices.includes('always') : request.allowPermanent !== false

  const respond = useCallback(
    async (choice: ApprovalChoice) => {
      const pending = sessionApprovalRequests(request.sessionId).get()

      if (submittingRef.current || !pending.some(item => item.requestId === request.requestId)) {
        return
      }

      if (!gateway) {
        notifyError(new Error(copy.gatewayDisconnected), copy.sendFailed, { action: reconnectAction() })

        return
      }

      submittingRef.current = true

      try {
        await stack.depart(() => sendApproval(request, choice))
        restoreFocusOrigin()
      } catch (error) {
        releaseApprovalKey()
        notifyError(error, copy.sendFailed)
        submittingRef.current = false
        throw error
      }
    },
    [copy.gatewayDisconnected, copy.sendFailed, gateway, request, restoreFocusOrigin, stack]
  )

  return (
    <article
      aria-hidden={!present || undefined}
      className="min-w-0"
      data-request-id={request.requestId}
      data-slot="tool-approval-card"
      inert={!present || stack.busy}
      onPointerDownCapture={rememberFocusOrigin}
      ref={cardRef}
    >
      <VantaApprovalCard
        allowNever={false}
        approval={approvalPayload(request, canRemember)}
        onAnswer={decision => respond(CHOICE_FOR_DECISION[decision])}
        position={total > 1 ? `${position} / ${total}` : undefined}
        projectName={projectName}
      />
    </article>
  )
}
