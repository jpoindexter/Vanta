const BASE_DELAY_MS = 250;
const MAX_DELAY_MS = 4000;
export const MAX_CONNECTION_ATTEMPTS = 6;

const NETWORK_MESSAGES = /failed to fetch|load failed|networkerror|network request failed|err_connection/i;

/** A fetch that never reached the runtime (not an HTTP error the runtime answered). */
export function isConnectionFailure(reason: unknown): boolean {
  return reason instanceof TypeError || (reason instanceof Error && NETWORK_MESSAGES.test(reason.message));
}

/** 250ms, 500ms, 1s, 2s, then 4s: the runtime usually answers within the first two. */
export function connectionRetryDelay(attempt: number): number {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempt));
}
