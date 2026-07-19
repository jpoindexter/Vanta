import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type ProviderAuthRequired = {
  provider: string;
  model: string;
  baseRoute: string;
  billingMode: "included" | "metered" | "local" | "unknown";
  authMethod: "subscription" | "api_key" | "local" | "unknown";
};

export function providerAuthRequiredPath(root: string): string {
  return join(root, ".vanta", "provider-auth-required.json");
}

export async function loadProviderAuthRequired(root: string): Promise<ProviderAuthRequired | undefined> {
  try {
    const value = JSON.parse(await readFile(providerAuthRequiredPath(root), "utf8")) as Partial<ProviderAuthRequired>;
    if (!value.provider || !value.model || !value.baseRoute) return undefined;
    if (!isBillingMode(value.billingMode) || !isAuthMethod(value.authMethod)) return undefined;
    return { provider: value.provider, model: value.model, baseRoute: value.baseRoute, billingMode: value.billingMode, authMethod: value.authMethod };
  } catch {
    return undefined;
  }
}

export async function saveProviderAuthRequired(root: string, value: ProviderAuthRequired): Promise<void> {
  const path = providerAuthRequiredPath(root);
  const temporary = `${path}.tmp`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

export async function clearProviderAuthRequired(root: string): Promise<void> {
  await rm(providerAuthRequiredPath(root), { force: true });
}

function isBillingMode(value: unknown): value is ProviderAuthRequired["billingMode"] {
  return value === "included" || value === "metered" || value === "local" || value === "unknown";
}

function isAuthMethod(value: unknown): value is ProviderAuthRequired["authMethod"] {
  return value === "subscription" || value === "api_key" || value === "local" || value === "unknown";
}
