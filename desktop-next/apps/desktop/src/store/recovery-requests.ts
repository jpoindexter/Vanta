import { atom } from 'nanostores'

/**
 * Recovery intents raised from surfaces that have no React Router context or
 * no knowledge of the active profile — chiefly notification action buttons
 * fired from stores. The shell controller (`app/contrib/wiring.tsx`) owns
 * `navigate` and the active profile, so it consumes these and performs the
 * navigation / restart. Same shape as `$poolLimitsSettingsRequest` and
 * `$billingSettingsRequest`, generalised to any in-app route.
 *
 * Both atoms carry a `seq` so an identical request twice in a row (the user
 * clicks the same toast button again) still fires.
 */

export interface RouteRequest {
  seq: number
  /** In-app hash route, e.g. `/settings?tab=keys&key=OPENAI_API_KEY`. */
  path: string
}

export const $routeRequest = atom<RouteRequest | null>(null)

let routeSeq = 0

export function requestRoute(path: string): void {
  routeSeq += 1
  $routeRequest.set({ seq: routeSeq, path })
}

/**
 * True from an unexpected server exit until it is restarted. The gateway link is plain HTTP, so its connection state
 * stays "open" after the server dies; this is what lets the status bar say so.
 */
export const $backendStopped = atom(false)

export function setBackendStopped(stopped: boolean): void {
  $backendStopped.set(stopped)
}

/** Restart the local Vanta service for the profile currently in view. */
export const $backendRestartRequest = atom(0)

export function requestBackendRestart(): void {
  $backendRestartRequest.set($backendRestartRequest.get() + 1)
}
