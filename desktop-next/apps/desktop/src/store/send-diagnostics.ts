// "Send Diagnostics" — the error card's consent-gated debug-bundle upload.
//
// Flow: an error card (or any surface) calls requestSendDiagnostics() with
// optional error context → the modal host renders the privacy notice → the
// user explicitly clicks Upload → diagnostics.share_vanta runs backend-side
// (collect + force-redact + Vanta-S3 upload) → the modal shows the private
// view link plus the support handoff (GitHub Issues · Vanta Portal Support ·
// Discord).
//
// Consent is per-upload and explicit — no "always allow", mirroring the CLI's
// `vanta debug share --vanta` confirmation contract. On a remote connection
// the backend bundles ITS OWN logs (the runtime that owns the failure); the
// local desktop.log is attached as a client-side extra so support sees both
// halves in one bundle.
import { atom } from 'nanostores'

import { translateNow } from '@/i18n'
import { isDiagnosticsUploadConfigured } from '@/lib/vanta-endpoints'
import { $gateway } from '@/store/gateway'

export interface SendDiagnosticsResult {
  expiresAt?: string
  uploadId?: string
  viewUrl?: string
}

export interface SendDiagnosticsState {
  /** Short text describing the failure that prompted the report (attached
   *  to the bundle as error-context.txt, redacted server-side). */
  errorContext?: string
  error?: string
  phase: 'consent' | 'done' | 'error' | 'uploading'
  result?: SendDiagnosticsResult
}

export const $sendDiagnostics = atom<SendDiagnosticsState | null>(null)

// Generation token: bumped on every open AND every dismiss. An in-flight
// upload captures the generation it started under and only writes its
// completion back when the token still matches — so dismissing mid-upload is
// immediate and a stale completion can't resurrect or overwrite the dialog.
// Request cancellation stays best-effort (the WS call runs to completion
// server-side; we just ignore the result).
let generation = 0

/** Open the consent modal. No network I/O happens until the user confirms. */
export function requestSendDiagnostics(errorContext?: string): void {
  generation += 1
  $sendDiagnostics.set({ errorContext, phase: 'consent' })
}

export function dismissSendDiagnostics(): void {
  generation += 1
  $sendDiagnostics.set(null)
}

interface ShareVantaResponse {
  error?: string
  expires_at?: string
  ok: boolean
  upload_id?: string
  view_url?: string
}

/** Read the LOCAL desktop log via Electron so a remote backend's bundle still
 *  carries the Desktop-side transport evidence. Best-effort: absence of the
 *  IPC (browser dashboard, older shells) just omits the file. */
async function collectLocalExtras(): Promise<Record<string, string>> {
  try {
    const logs = await window.desktopBridge?.getRecentLogs?.()
    const lines = Array.isArray(logs?.lines) ? logs.lines : []

    return lines.length ? { 'desktop.log': lines.join('\n') } : {}
  } catch {
    return {}
  }
}

// Bundle collection + upload legitimately takes a while (log reads + gzip +
// S3 leg); the default WS timeout is too tight for slow disks/links.
const SHARE_TIMEOUT_MS = 120_000

interface UploadOutcome {
  response?: ShareVantaResponse
  stale?: true
}

/** Collect the bundle and ask the backend to upload it; `stale` when the dialog closed meanwhile. */
async function runUpload(current: SendDiagnosticsState, stillCurrent: () => boolean): Promise<UploadOutcome> {
  const gateway = $gateway.get()

  if (!gateway) {
    throw new Error('Vanta gateway unavailable')
  }

  const extraFiles = await collectLocalExtras()

  if (!stillCurrent()) {
    return { stale: true }
  }

  const response = await gateway.request<ShareVantaResponse>(
    'diagnostics.share_vanta',
    {
      ...(current.errorContext ? { error_context: current.errorContext } : {}),
      ...(Object.keys(extraFiles).length ? { extra_files: extraFiles } : {})
    },
    SHARE_TIMEOUT_MS
  )

  return stillCurrent() ? { response } : { stale: true }
}

/** User confirmed — run the upload. Transitions consent → uploading → done/error. */
export async function confirmSendDiagnostics(): Promise<void> {
  const current = $sendDiagnostics.get()

  if (!current || current.phase !== 'consent') {
    return
  }

  // No Vanta endpoint is set: never reach the backend upload call.
  if (!isDiagnosticsUploadConfigured()) {
    $sendDiagnostics.set({ ...current, error: translateNow('sendDiagnostics.notConfigured'), phase: 'error' })

    return
  }

  const startedGeneration = generation

  // Only write back while the dialog the upload belongs to is still open.
  const stillCurrent = () => generation === startedGeneration

  $sendDiagnostics.set({ ...current, phase: 'uploading' })

  try {
    const { response, stale } = await runUpload(current, stillCurrent)

    if (stale || !response) {
      return
    }

    if (!response.ok) {
      throw new Error(response.error || 'upload failed')
    }

    $sendDiagnostics.set({
      ...current,
      phase: 'done',
      result: { expiresAt: response.expires_at, uploadId: response.upload_id, viewUrl: response.view_url }
    })
  } catch (error) {
    if (!stillCurrent()) {
      return
    }

    $sendDiagnostics.set({
      ...current,
      error: error instanceof Error ? error.message : String(error),
      phase: 'error'
    })
  }
}
