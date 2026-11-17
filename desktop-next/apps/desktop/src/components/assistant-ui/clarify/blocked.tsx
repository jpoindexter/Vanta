import { useStore } from '@nanostores/react'
import { type FC, useState } from 'react'

import { BlockedCard } from '@/components/chat/vanta/status-cards'
import { triggerHaptic } from '@/lib/haptics'
import { bareChoice, type ClarifyQuestion, type ClarifyRequest, clearClarifyRequest } from '@/store/clarify'
import { $gateway } from '@/store/gateway'
import { notifyError } from '@/store/notifications'

import { lockClarifyAnswers } from './lock'

const MAX_OPTIONS = 4
const DEFAULT_TITLE = 'I need your input'

/**
 * A question the agent titled, with two to four choices, is a decision: a flat
 * card where picking an option answers it. Untitled questions keep the full
 * form (staging, number keys, free text).
 */
export function isBlockedShape(questions: readonly ClarifyQuestion[], title: string | undefined): boolean {
  const [only] = questions
  const count = only?.choices?.length ?? 0

  return Boolean(title) && questions.length === 1 && !only!.multiSelect && count >= 2 && count <= MAX_OPTIONS
}

/** The agent cannot continue without a choice; picking an option answers and resumes it. */
export const BlockedClarify: FC<{
  onAnswered: () => void
  question: ClarifyQuestion
  request: ClarifyRequest
  title?: string
}> = ({ onAnswered, question, request, title }) => {
  const gateway = useStore($gateway)
  const [submitting, setSubmitting] = useState(false)
  const choices = question.choices ?? []

  const choose = async (id: string) => {
    const choice = choices[Number(id)]

    if (!choice || !gateway || submitting) {
      return
    }

    setSubmitting(true)

    try {
      await lockClarifyAnswers(request, gateway, [{ answer: bareChoice(choice), qid: question.qid }])
      triggerHaptic('submit')
      onAnswered()
      clearClarifyRequest(request.requestId, request.sessionId)
    } catch (error) {
      notifyError(error, 'Could not send your answer')
      setSubmitting(false)
    }
  }

  return (
    <BlockedCard
      actions={choices.map((choice, index) => ({
        disabled: submitting,
        id: String(index),
        label: bareChoice(choice),
        primary: index === 0
      }))}
      body={question.question}
      onAction={id => void choose(id)}
      title={title ?? DEFAULT_TITLE}
    />
  )
}
