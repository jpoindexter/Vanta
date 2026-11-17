import { RUNTIME_ADAPTER_PREFIX } from "./constants.js";
import { RuntimeIdSchema } from "./types.js";

// A hired worker's `adapter` is either a provider id ("openai": the Vanta
// native loop on that model backend) or "cli:<runtime id>" (an external CLI).

/** The external runtime id behind an adapter string, or null for a provider adapter. */
export function runtimeIdFromAdapter(adapter: string | undefined): string | null {
  if (!adapter?.startsWith(RUNTIME_ADAPTER_PREFIX)) return null;
  const parsed = RuntimeIdSchema.safeParse(adapter.slice(RUNTIME_ADAPTER_PREFIX.length));
  return parsed.success ? parsed.data : null;
}

export const isRuntimeAdapter = (adapter: string | undefined): boolean => adapter?.startsWith(RUNTIME_ADAPTER_PREFIX) === true;

export const adapterForRuntime = (runtimeId: string): string => `${RUNTIME_ADAPTER_PREFIX}${runtimeId}`;
