import { requestComposerFocus, requestComposerInsert } from '@/app/chat/composer/focus'
import { EmptyState } from '@/components/chat/vanta/empty-state'

export interface IntroProps {
  /** Kept for callers that still pass them; the empty state no longer rotates copy. */
  personality?: string
  seed?: number
}

function pickPrompt(prompt: string): void {
  requestComposerInsert(prompt)
  requestComposerFocus()
}

/** The empty chat: a capability line, four starter prompts, and the composer focused. */
export function Intro(_props: IntroProps) {
  return <EmptyState onPick={pickPrompt} />
}
