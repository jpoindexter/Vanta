import type { Translations } from '@/i18n'
import { notifyError } from '@/store/notifications'
import { requestDesktopOnboarding } from '@/store/onboarding'

import { isProviderSetupError } from './utils'

/** Reuse setup for primary credential failures; never retry a rejected send. */
export function requestMissingProviderSetup(error: unknown, reason: string): boolean {
  if (!isProviderSetupError(error)) return false

  requestDesktopOnboarding(reason)

  return true
}

export function reportSessionCreationError(
  error: unknown,
  copy: Pick<Translations['desktop'], 'providerCredentialRequired' | 'sessionUnavailable'>
): void {
  if (!requestMissingProviderSetup(error, copy.providerCredentialRequired)) {
    notifyError(error, copy.sessionUnavailable)
  }
}
