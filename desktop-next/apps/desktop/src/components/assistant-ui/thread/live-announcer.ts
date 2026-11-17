/** Pure rules for what the transcript's live region says while a reply streams. */

export const RESPONSE_COMPLETE = 'Response complete'

export interface AnnounceState {
  /** Paragraphs of the current reply already queued for the screen reader. */
  announced: number
  /** The reply being tracked. */
  messageId: string
}

export interface AnnounceInput {
  isRunning: boolean
  messageId: string
  text: string
}

export interface AnnounceStep {
  /** New lines for the live region, in reading order. */
  lines: string[]
  state: AnnounceState
}

const paragraphsOf = (text: string): string[] =>
  text
    .split(/\n{2,}/)
    .map(paragraph => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

/**
 * While a reply streams, announce a paragraph once the next one has begun (so
 * a screen reader never reads half a sentence); when the run ends, announce
 * whatever is left and then "Response complete". Never announce per token.
 */
export function nextAnnouncement(previous: AnnounceState | null, input: AnnounceInput): AnnounceStep {
  const state: AnnounceState =
    previous && previous.messageId === input.messageId ? previous : { announced: 0, messageId: input.messageId }

  const paragraphs = paragraphsOf(input.text)
  const stable = input.isRunning ? Math.max(0, paragraphs.length - 1) : paragraphs.length
  const lines = paragraphs.slice(state.announced, stable)

  if (!input.isRunning && paragraphs.length > 0 && (previous?.messageId === input.messageId || lines.length > 0)) {
    lines.push(RESPONSE_COMPLETE)
  }

  return { lines, state: { ...state, announced: Math.max(state.announced, stable) } }
}
