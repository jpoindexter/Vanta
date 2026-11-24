import { atom } from 'nanostores'

/** How much Vanta may do without asking. The server enforces it per project (`GET|POST /api/access-mode`). */
export type PermissionMode = 'accept-edits' | 'auto' | 'full' | 'manual' | 'plan'

/** The server's own id for each mode (`vanta-ts/src/desktop/access-mode.ts`). */
export type AccessModeId = 'approve' | 'ask' | 'auto' | 'full' | 'plan'

export interface PermissionModeOption {
  id: PermissionMode
  label: string
  /** One line, shown under the label in the menu. */
  hint: string
}

export const PERMISSION_MODES: readonly PermissionModeOption[] = [
  { hint: 'Every edit and command waits for you.', id: 'manual', label: 'Ask each time' },
  { hint: 'File edits in the project go through; commands still ask.', id: 'accept-edits', label: 'Accept edits' },
  { hint: 'Read only: Vanta plans and writes nothing.', id: 'plan', label: 'Plan' },
  { hint: 'Routine edits and safe actions go through; the rest asks.', id: 'auto', label: 'Auto' },
  { hint: 'Nothing asks inside the project. Blocked actions stay blocked.', id: 'full', label: 'Full access' }
]

const ACCESS_ID: Record<PermissionMode, AccessModeId> = {
  'accept-edits': 'approve',
  auto: 'auto',
  full: 'full',
  manual: 'ask',
  plan: 'plan'
}

export type PermissionRequester = (method: string, params?: Record<string, unknown>) => Promise<unknown>

/** `unknown` until the server has answered: the chip must not claim a mode the server did not report. */
export type PermissionStatus = 'error' | 'ready' | 'unknown'

export const $permissionMode = atom<PermissionMode>('manual')
export const $permissionStatus = atom<PermissionStatus>('unknown')
/** The project root the mode belongs to ('' until known). */
export const $permissionRoot = atom('')

let revision = 0

export const accessIdForMode = (mode: PermissionMode): AccessModeId => ACCESS_ID[mode]

const modeForAccessId = (id: unknown): PermissionMode | null =>
  (Object.keys(ACCESS_ID) as PermissionMode[]).find(mode => ACCESS_ID[mode] === id) ?? null

export function permissionModeLabel(mode: PermissionMode): string {
  return PERMISSION_MODES.find(option => option.id === mode)?.label ?? 'Ask each time'
}

function parseAccess(result: unknown): { mode: PermissionMode; root: string } | null {
  const body = typeof result === 'object' && result !== null ? (result as Record<string, unknown>) : {}
  const mode = modeForAccessId(body.value)

  return mode ? { mode, root: typeof body.root === 'string' ? body.root : '' } : null
}

const sessionParam = (sessionId: null | string) => (sessionId ? { session_id: sessionId } : {})

function adopt(read: { mode: PermissionMode; root: string }): void {
  $permissionMode.set(read.mode)
  $permissionRoot.set(read.root)
  $permissionStatus.set('ready')
}

/** Read the project's real mode from the server. A failure leaves the status `error`, never a guessed mode. */
export async function syncPermissionMode(request: PermissionRequester, sessionId: null | string): Promise<void> {
  const mine = ++revision

  try {
    const read = parseAccess(await request('config.get', { key: 'access_mode', ...sessionParam(sessionId) }))

    if (mine !== revision) {
      return
    }

    if (read) {
      adopt(read)
    } else {
      $permissionStatus.set('error')
    }
  } catch {
    if (mine === revision) {
      $permissionStatus.set('error')
    }
  }
}

/**
 * Ask the server to enforce `mode` for the project. The chip changes only once the server confirms it,
 * so a failed write leaves the previous (real) mode on screen and rejects with the reason.
 */
export async function applyPermissionMode(
  request: PermissionRequester,
  mode: PermissionMode,
  options: { acknowledged?: boolean; sessionId: null | string }
): Promise<PermissionMode> {
  const mine = ++revision

  const read = parseAccess(
    await request('config.set', {
      key: 'access_mode',
      value: ACCESS_ID[mode],
      ...(options.acknowledged ? { acknowledged: true } : {}),
      ...sessionParam(options.sessionId)
    })
  )

  if (!read) {
    throw new Error('Vanta did not confirm the access mode, so it was not changed.')
  }

  if (mine === revision) {
    adopt(read)
  }

  return read.mode
}
