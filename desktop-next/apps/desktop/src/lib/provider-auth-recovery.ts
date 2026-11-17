/**
 * Reconnect a provider whose saved key was refused, then resume the request that was stopped.
 * Ported from the previous Vanta desktop (`provider-auth-recovery.ts`): the key is saved first and the
 * request is retried only when the stop was a provider-auth stop, so reconnecting from Settings
 * without a stopped request never replays an old one. If saving fails nothing is retried.
 */
export async function reconnectProviderAndResume(
  save: (provider: string, model: string, apiKey: string) => Promise<void>,
  retry: () => Promise<void> | void,
  input: { apiKey: string; model: string; provider: string; resume: boolean }
): Promise<void> {
  await save(input.provider, input.model, input.apiKey)

  if (input.resume) {
    await retry()
  }
}
