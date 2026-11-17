import { atom } from 'nanostores'

import { triggerHaptic } from '@/lib/haptics'

import { patchStashedCustodyOccurrence } from './draft-custody-registry'
import { attachmentOccurrenceIndex, patchStashedDraftAttachmentOccurrence } from './session-draft-state'

/** Release blob: chip previews created for OS image drops (see #63682). */
export function revokeAttachmentPreviewUrl(url?: string | null) {
  if (url?.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url)
    } catch {
      // Best-effort — a revoked/invalid URL must not break chip removal.
    }
  }
}

/** Revoke blob: previews for attachments whose consumer was discarded. */
export function revokeAttachmentPreviewUrls(attachments: readonly ComposerAttachment[]) {
  for (const attachment of attachments) {
    revokeAttachmentPreviewUrl(attachment.previewUrl)
  }
}

/**
 * Revoke blob: previews from `previous` that are not retained by `next`.
 * Used when a queued/optimistic snapshot is replaced or dropped.
 */
export function revokeDiscardedAttachmentPreviews(
  previous: readonly ComposerAttachment[],
  next: readonly ComposerAttachment[] = []
) {
  const retained = new Set(
    next.map(attachment => attachment.previewUrl).filter((url): url is string => !!url?.startsWith('blob:'))
  )

  for (const attachment of previous) {
    const url = attachment.previewUrl

    if (url?.startsWith('blob:') && !retained.has(url)) {
      revokeAttachmentPreviewUrl(url)
    }
  }
}

export interface ClearAttachmentsOptions {
  /**
   * When true, leave blob: preview URLs alive for a submitted/queued snapshot
   * that still references them. Caller must revoke when that consumer is
   * discarded or replaced (see #63682 / PR review on #66546).
   */
  retainPreviewUrls?: boolean
}

export interface ComposerAttachment {
  id: string
  /** Renderer-lifetime identity for one attachment occurrence. Unlike `id`,
   * which is content/path-derived, this survives draft cloning but changes
   * when the user removes and re-adds the same attachment. */
  occurrenceId?: string
  kind: 'file' | 'folder' | 'image' | 'terminal' | 'url'
  label: string
  detail?: string
  refText?: string
  /** Legacy/on-demand full source. New local image chips omit this and read
   * `path` only when the lightbox opens, avoiding retained multi-MB base64. */
  previewUrl?: string
  /** Downscaled data URL for the attachment card and optimistic bubble only. */
  thumbnailUrl?: string
  path?: string
  /** An image held in composer memory and sent in the chat request body (`prompt.submit` images[]). */
  imageData?: { dataBase64: string; mime: string }
  /** Bounded source text from a Vanta-generated large paste, sent only to the title path. */
  titlePreview?: string
  attachedSessionId?: string
  /** Set while the file/image bytes are being staged into the session
   * workspace (remote upload or local stage), and 'error' if that failed.
   * Drives the spinner / error state on the composer attachment card. */
  uploadState?: 'uploading' | 'error'
}

export type ComposerAttachmentPatch = Partial<Omit<ComposerAttachment, 'id' | 'occurrenceId'>>

export const $composerDraft = atom('')
export const $composerAttachments = atom<ComposerAttachment[]>([])
export const $composerTerminalSelections = atom<Record<string, string>>({})

// Latched because opening a fresh session may remount the main composer before
// it can start voice. Session-tile composers deliberately never consume this.
export const $voiceConversationStartRequest = atom(0)
let nextVoiceStartRequest = 0
let handledVoiceStartRequest = 0
export const createComposerAttachmentOccurrenceId = (): string => crypto.randomUUID()

export const requestVoiceConversationStart = (): void => $voiceConversationStartRequest.set(++nextVoiceStartRequest)

export const takeVoiceConversationStart = (current: number): boolean => {
  if (current <= handledVoiceStartRequest) {
    return false
  }

  handledVoiceStartRequest = current

  return true
}

// ---------------------------------------------------------------------------
// Composer scopes — one live attachment set PER MOUNTED COMPOSER. The main
// chat's scope wraps the module-level atom above (all existing readers keep
// working); each session tile creates its own so two composers on screen
// never share chips. Draft text needs no scope: it lives in each ChatBar's
// DOM + draftRef and stashes per session key already.
// ---------------------------------------------------------------------------

export interface ComposerAttachmentScope {
  $attachments: ReturnType<typeof atom<ComposerAttachment[]>>
  add(attachment: ComposerAttachment): void
  clear(options?: ClearAttachmentsOptions): void
  remove(id: string): ComposerAttachment | null
  removeOccurrences(attachments: readonly ComposerAttachment[]): void
  setUploadState(id: string, uploadState?: ComposerAttachment['uploadState']): void
  update(attachment: ComposerAttachment): boolean
  updateIfCurrent(expected: ComposerAttachment, patch: ComposerAttachmentPatch): boolean
}

export function createComposerAttachmentScope($attachments = atom<ComposerAttachment[]>([])): ComposerAttachmentScope {
  return {
    $attachments,
    add(attachment) {
      const previous = $attachments.get()
      const next = upsertAttachment(previous, attachment)
      $attachments.set(next)

      if (next.length > previous.length && attachment.kind !== 'url') {
        triggerHaptic('selection')
      }
    },
    clear(options) {
      if (!options?.retainPreviewUrls) {
        revokeAttachmentPreviewUrls($attachments.get())
      }

      $attachments.set([])
    },
    remove(id) {
      const current = $attachments.get()
      const removed = current.find(attachment => attachment.id === id) || null
      $attachments.set(current.filter(attachment => attachment.id !== id))
      revokeAttachmentPreviewUrl(removed?.previewUrl)

      return removed
    },
    removeOccurrences(attachments) {
      const current = $attachments.get()

      const submittedOccurrences = new Set(
        attachments
          .filter(attachment => attachment.occurrenceId !== undefined)
          .map(attachment => `${attachment.id}\u0000${attachment.occurrenceId}`)
      )

      const submittedLegacy = new Set(attachments.filter(attachment => attachment.occurrenceId === undefined))

      const next = current.filter(attachment =>
        attachment.occurrenceId === undefined
          ? !submittedLegacy.has(attachment)
          : !submittedOccurrences.has(`${attachment.id}\u0000${attachment.occurrenceId}`)
      )

      // Preserve clear()'s notification semantics even when no captured
      // occurrence remains. Some composer consumers settle local state on the
      // successful-submit store emission.
      $attachments.set(next)
    },
    setUploadState(id, uploadState) {
      const current = $attachments.get()
      const index = current.findIndex(attachment => attachment.id === id)

      if (index < 0) {
        return
      }

      const next = [...current]
      next[index] = { ...next[index]!, uploadState }
      $attachments.set(next)
    },
    update(attachment) {
      const current = $attachments.get()
      const index = current.findIndex(item => item.id === attachment.id)

      if (index < 0) {
        return false
      }

      const previous = current[index]
      const next = [...current]
      next[index] = attachment
      $attachments.set(next)

      if (previous?.previewUrl && previous.previewUrl !== attachment.previewUrl) {
        revokeAttachmentPreviewUrl(previous.previewUrl)
      }

      return true
    },
    updateIfCurrent(expected, patch) {
      const savedOccurrenceUpdated = patchStashedCustodyOccurrence(expected, patch)
      const current = $attachments.get()
      const index = attachmentOccurrenceIndex(current, expected)

      if (index < 0) {
        return savedOccurrenceUpdated
      }

      const next = [...current]
      next[index] = { ...next[index]!, ...patch }
      $attachments.set(next)

      return true
    }
  }
}

/** The main chat's scope — the module-level atom, so every existing
 *  `$composerAttachments` reader/writer IS this scope. */
export const mainComposerScope = createComposerAttachmentScope($composerAttachments)

export { $freshDraftKey, NEW_SESSION_DRAFT_KEY, freshDraftScope, rotateFreshDraftKey, isFreshDraftScope } from './fresh-draft-scope'
export { $draftTitles, $restoredDraftNotice, SESSION_DRAFTS_STORAGE_KEY, draftTitleIn, draftTitleFor,
  reloadPersistedDrafts, noteDraftTextEdit, quoteSessionDraftText, currentDraftTextRevision,
  consumeSessionDraftText, stashSessionDraft, takeSessionDraft, clearSessionDraft, stashedDraftScopes } from './session-draft-state'
export type { SessionDraft, RestoredDraftNotice } from './session-draft-state'
export { migrateSessionDraft, announceNewSessionDraftKey, adoptNewSessionDraft, announceGoneSessionDraft,
  adoptGoneSessionDraft, dismissRestoredDraftNotice, undoRestoredDraft } from './session-draft-lifecycle'

export function patchMainComposerAttachmentOccurrence(expected: ComposerAttachment, patch: ComposerAttachmentPatch): boolean {
  const live = mainComposerScope.updateIfCurrent(expected, patch)
  const saved = patchStashedDraftAttachmentOccurrence(expected, patch)
  return live || saved
}

/**
 * Push a composer's live text into the shared stash (`flush`), or repaint it
 * from the stash (`reload`).
 *
 * Both halves of the HUD handoff need this. The stash is the only draft state
 * two windows share, but a mounted composer only consults it when its session
 * scope changes — so entering HUD mode has to flush the app window's in-editor
 * text down to the stash before the HUD boots and reads it, and leaving has to
 * repaint the app's editor from whatever the HUD left behind (usually empty,
 * because the HUD sent it).
 *
 * Dispatched synchronously, unlike the focus bus: the flush must complete
 * before the HUD window is created.
 */
const DRAFT_SYNC_EVENT = 'desktop:composer-draft-sync'

export type ComposerDraftSyncMode = 'flush' | 'reload'

interface ComposerDraftSyncDetail {
  mode: ComposerDraftSyncMode
  target: string
}

export function requestComposerDraftSync(mode: ComposerDraftSyncMode, target = 'main'): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<ComposerDraftSyncDetail>(DRAFT_SYNC_EVENT, { detail: { mode, target } }))
  }
}

export function onComposerDraftSyncRequest(handler: (detail: ComposerDraftSyncDetail) => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined
  }

  const listener = (event: Event) => handler((event as CustomEvent<ComposerDraftSyncDetail>).detail)
  window.addEventListener(DRAFT_SYNC_EVENT, listener)

  return () => window.removeEventListener(DRAFT_SYNC_EVENT, listener)
}

export function setComposerDraft(value: string) {
  $composerDraft.set(value)
}

export function appendComposerDraft(value: string) {
  const text = value.trim()

  if (!text) {
    return
  }

  const current = $composerDraft.get()
  const separator = current && !current.endsWith('\n') ? '\n\n' : ''

  $composerDraft.set(`${current}${separator}${text}`)
}

export function appendComposerInline(value: string) {
  const text = value.trim()

  if (!text) {
    return
  }

  const current = $composerDraft.get().trimEnd()
  const separator = current ? ' ' : ''

  $composerDraft.set(`${current}${separator}${text}`)
}

export function clearComposerDraft() {
  $composerDraft.set('')
}

// Main-scope conveniences — the names the app has always used.
export const addComposerAttachment = (attachment: ComposerAttachment) => mainComposerScope.add(attachment)
export const removeComposerAttachment = (id: string) => mainComposerScope.remove(id)

/** Replace an existing attachment in place by id. No-op (returns false) when the
 * id is gone — e.g. the user removed the chip while an eager upload was still in
 * flight, so a late success must NOT resurrect it. Use this instead of
 * addComposerAttachment for async results that may land after a removal. */
export const updateComposerAttachment = (attachment: ComposerAttachment) => mainComposerScope.update(attachment)

export const clearComposerAttachments = () => mainComposerScope.clear()

/** Update only the upload state of an existing attachment (no-op if it's gone,
 * e.g. the user removed it mid-upload). Pass `undefined` to clear it. */
export const setComposerAttachmentUploadState = (id: string, uploadState?: ComposerAttachment['uploadState']) =>
  mainComposerScope.setUploadState(id, uploadState)

const TERMINAL_REF_RE = /@terminal:(`[^`\n]+`|"[^"\n]+"|'[^'\n]+'|\S+)/g

function unquoteRefValue(raw: string) {
  const head = raw[0]
  const tail = raw[raw.length - 1]
  const quoted = (head === '`' && tail === '`') || (head === '"' && tail === '"') || (head === "'" && tail === "'")

  return (quoted ? raw.slice(1, -1) : raw).replace(/[,.;!?]+$/, '').trim()
}

function terminalLabelsFromDraft(draft: string) {
  const labels: string[] = []
  const seen = new Set<string>()

  for (const match of draft.matchAll(TERMINAL_REF_RE)) {
    const label = unquoteRefValue(match[1] || '')

    if (!label || seen.has(label)) {
      continue
    }

    seen.add(label)
    labels.push(label)
  }

  return labels
}

/** True when the draft still carries `@terminal:` chips (not already-frozen transport). */
export function draftHasTerminalChips(draft: string): boolean {
  return terminalLabelsFromDraft(draft).length > 0
}

export function setComposerTerminalSelection(label: string, text: string) {
  const nextLabel = label.trim()
  const nextText = text.trim()

  if (!nextLabel || !nextText) {
    return
  }

  const current = $composerTerminalSelections.get()

  if (current[nextLabel] === nextText) {
    return
  }

  $composerTerminalSelections.set({
    ...current,
    [nextLabel]: nextText
  })
}

export function reconcileComposerTerminalSelections(draft: string) {
  const current = $composerTerminalSelections.get()
  const labels = new Set(terminalLabelsFromDraft(draft))
  let changed = false
  const next: Record<string, string> = {}

  for (const [label, text] of Object.entries(current)) {
    if (!labels.has(label)) {
      changed = true

      continue
    }

    next[label] = text
  }

  if (changed) {
    $composerTerminalSelections.set(next)
  }
}

function terminalFence(text: string) {
  return `\`\`\`terminal\n${text}\n\`\`\``
}

function stripTerminalRefTokens(draft: string) {
  return draft
    .replace(new RegExp(TERMINAL_REF_RE.source, 'g'), '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim()
}

export interface ComposerTransportPayload {
  /** Model-facing text: fenced selection blocks with `@terminal:` chips stripped. */
  transportText: string
  /** UI-facing text: original chip form, when it differs from transport. */
  displayText: string
  /** Chip labels whose selection text is missing from the in-memory map. */
  missingLabels: string[]
}

/**
 * Freeze `@terminal:` chips into transport text at the moment a message
 * crosses a send/steer/enqueue boundary. The selection map is memory-only and
 * label-colliding — later resolve against it can inject a different pane's
 * output (#77078). Callers that cannot resolve every chip must fail closed.
 *
 * Idempotent: already-frozen transport (no chips) is returned unchanged.
 */
export function freezeComposerTransportPayload(
  draft: string,
  selections: Record<string, string> = $composerTerminalSelections.get()
): ComposerTransportPayload {
  const labels = terminalLabelsFromDraft(draft)

  if (labels.length === 0) {
    return { transportText: draft, displayText: draft, missingLabels: [] }
  }

  const missingLabels = labels.filter(label => !selections[label]?.trim())

  if (missingLabels.length > 0) {
    return { transportText: draft, displayText: draft, missingLabels }
  }

  const existingFences = new Set(draft.match(/```terminal\n[\s\S]*?\n```/g) ?? [])
  const fences: string[] = []

  for (const label of labels) {
    const text = selections[label]?.trim()

    if (!text) {
      continue
    }

    const fence = terminalFence(text)

    if (!existingFences.has(fence)) {
      fences.push(fence)
      existingFences.add(fence)
    }
  }

  const remainder = stripTerminalRefTokens(draft)
  const transportText = [...fences, remainder].filter(Boolean).join('\n\n')

  return { transportText, displayText: draft, missingLabels: [] }
}

export function terminalContextBlocksFromDraft(draft: string) {
  const labels = terminalLabelsFromDraft(draft)

  if (labels.length === 0) {
    return []
  }

  const selections = $composerTerminalSelections.get()

  return labels.flatMap(label => {
    const text = selections[label]?.trim()

    if (!text) {
      return []
    }

    return terminalFence(text)
  })
}

export function clearComposerTerminalSelections() {
  if (Object.keys($composerTerminalSelections.get()).length === 0) {
    return
  }

  $composerTerminalSelections.set({})
}

function upsertAttachment(attachments: ComposerAttachment[], attachment: ComposerAttachment) {
  const index = attachments.findIndex(item => item.id === attachment.id)

  if (index < 0) {
    return [...attachments, attachment]
  }

  const previous = attachments[index]
  const next = [...attachments]
  next[index] = attachment

  if (previous?.previewUrl && previous.previewUrl !== attachment.previewUrl) {
    revokeAttachmentPreviewUrl(previous.previewUrl)
  }

  return next
}
