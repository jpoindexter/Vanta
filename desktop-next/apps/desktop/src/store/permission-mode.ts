import { atom } from 'nanostores'

import { persistString, storedString } from '@/lib/storage'

/** How much Vanta may do without asking. Mirrors the server's access modes (`GET|POST /api/access-mode`). */
export type PermissionMode = 'accept-edits' | 'auto' | 'full' | 'manual' | 'plan'

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

const KEY = 'vanta.desktop.permission-mode.v1'

const isMode = (value: null | string): value is PermissionMode => PERMISSION_MODES.some(option => option.id === value)

const stored = storedString(KEY)

export const $permissionMode = atom<PermissionMode>(isMode(stored) ? stored : 'manual')

/** Local selection until the gateway wires the access mode (DN-12). */
export function setPermissionMode(mode: PermissionMode): void {
  $permissionMode.set(mode)
  persistString(KEY, mode)
}

export const permissionModeLabel = (mode: PermissionMode): string =>
  PERMISSION_MODES.find(option => option.id === mode)?.label ?? 'Ask each time'
