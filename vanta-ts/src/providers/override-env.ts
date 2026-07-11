/** Build provider resolution env for a child without carrying a model across providers. */
export function providerOverrideEnv(
  env: NodeJS.ProcessEnv,
  provider?: string,
  model?: string,
): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = { ...env };
  if (provider) {
    merged.VANTA_PROVIDER = provider;
    if (!model) delete merged.VANTA_MODEL;
  }
  if (model) merged.VANTA_MODEL = model;
  return merged;
}
