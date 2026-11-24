import {
  FeedbackReportSchema,
  type FeedbackDraft,
  type FeedbackReceipt,
  type FeedbackReport
} from '@vanta/shared/feedback'
import { atom } from 'nanostores'

import type { DesktopVersionInfo } from '@/global'
import {
  blankFeedback,
  prepareFeedback,
  readFeedbackDraft,
  saveFeedbackDraft
} from '@/lib/feedback'
import { sendFeedback } from '@/lib/send-feedback'

const PENDING_KEY = 'desktop:feedback-pending:v1'
interface FeedbackState {
  open: boolean
  draft: FeedbackDraft
  pending: FeedbackReport | null
  receipt: FeedbackReceipt | null
  busy: boolean
  error: 'storage' | 'delivery' | 'prepare' | null
}

function readPending(): FeedbackReport | null {
  try {
    return FeedbackReportSchema.parse(
      JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null')
    )
  } catch {
    return null
  }
}

export const $feedback = atom<FeedbackState>({
  open: false,
  draft: readFeedbackDraft(),
  pending: readPending(),
  receipt: null,
  busy: false,
  error: null
})
export function requestFeedback(): void {
  const state = $feedback.get()
  $feedback.set({
    ...state,
    open: true,
    receipt: null,
    error: state.receipt ? null : state.error
  })
}
export function dismissFeedback(): void {
  $feedback.set({ ...$feedback.get(), open: false })
}

export function changeFeedback(patch: Partial<FeedbackDraft>): void {
  const state = $feedback.get()
  if (state.busy || state.pending) return
  const draft = { ...state.draft, ...patch }
  const saved = saveFeedbackDraft(draft)
  $feedback.set({
    ...state,
    draft,
    receipt: null,
    error: saved ? null : 'storage'
  })
}

export async function confirmFeedback(
  version: DesktopVersionInfo | null
): Promise<void> {
  const state = $feedback.get()
  if (state.busy || state.receipt) return
  let report: FeedbackReport
  try {
    report = state.pending ?? prepareFeedback(state.draft, version)
  } catch {
    $feedback.set({ ...state, error: 'prepare' })
    return
  }
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(report))
  } catch {
    $feedback.set({ ...state, error: 'storage' })
    return
  }
  $feedback.set({ ...state, pending: report, busy: true, error: null })
  try {
    const receipt = await sendFeedback(report)
    const current = $feedback.get()
    const draft = blankFeedback()
    let saved = saveFeedbackDraft(draft)
    try {
      localStorage.removeItem(PENDING_KEY)
    } catch {
      saved = false
    }
    $feedback.set({
      ...current,
      draft,
      pending: null,
      receipt,
      busy: false,
      error: saved ? null : 'storage'
    })
  } catch {
    $feedback.set({ ...$feedback.get(), busy: false, error: 'delivery' })
  }
}
