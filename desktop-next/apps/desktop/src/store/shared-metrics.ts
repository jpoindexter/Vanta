import type { SharedMetricsConsentResult } from '@hermes/shared'
import { atom } from 'nanostores'

/**
 * Vanta does not collect or share usage metrics, so there is no consent to ask for. The names
 * below remain only so imported call sites compile; every function is inert and nothing is
 * stored, queued or sent anywhere.
 */

export type SharedMetricsConsent = SharedMetricsConsentResult

export type SharedMetricsChoice = 'local' | 'off' | 'share'

export type SharedMetricsRequester = <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>

export const $sharedMetricsConsent = atom<SharedMetricsConsent | null>(null)

export const $sharedMetricsDetailsOpen = atom(false)

export function sharedMetricsProfileRequester(request: SharedMetricsRequester, _profile?: string): SharedMetricsRequester {
  return request
}

export function sharedMetricsOfferPending(_consent: SharedMetricsConsent | null): boolean {
  return false
}

export async function reportPendingUpdateRun(_request: SharedMetricsRequester): Promise<void> {}
