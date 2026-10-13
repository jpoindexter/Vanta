import type { RuntimeOption } from '@/api/vanta-company-schemas'

export interface Availability {
  /** Why this runtime cannot be picked. Null when it can. */
  blocked: null | string
  /** Something the owner should know before picking it. Null when there is nothing. */
  caution: null | string
}

export const SELF_APPROVING_WARNING =
  'Self-approving CLI: it approves its own actions, so Vanta cannot hold its tool calls for your approval. Vanta still asks once before each start.'

/** Which runtimes the hire dialog may offer, and what to say about the ones it cannot or should not. */
export function availabilityOf(option: RuntimeOption): Availability {
  const detail = option.reason ? ` ${option.reason}` : ''

  if (!option.installed) {
    return { blocked: `${option.displayName} is not installed on this machine.${detail}`, caution: null }
  }

  if (option.auth === 'unauthenticated') {
    return {
      blocked: `${option.displayName} is signed out. Sign in with its own command, then reopen this dialog.${detail}`,
      caution: null
    }
  }

  const unchecked =
    option.auth === 'unknown' ? 'Sign-in status could not be checked, so a run may fail to start.' : null

  return {
    blocked: null,
    caution: [option.selfApproving ? SELF_APPROVING_WARNING : null, unchecked].filter(Boolean).join(' ') || null
  }
}
