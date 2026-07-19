export async function reconnectProviderAndResume(
  save: (provider: string, model: string, apiKey: string) => Promise<void>,
  retry: () => void | Promise<void>,
  input: { provider: string; model: string; apiKey: string; resume: boolean },
): Promise<void> {
  await save(input.provider, input.model, input.apiKey);
  if (input.resume) await retry();
}
