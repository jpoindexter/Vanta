import { JSON_RPC_METHOD_NOT_FOUND } from '@hermes/shared'

export interface UnsupportedResult {
  error: { code: number; message: string }
  key?: string
  method: string
  unsupported: true
}

export function isUnsupportedResult(value: unknown): value is UnsupportedResult {
  return Boolean(value) && typeof value === 'object' && (value as { unsupported?: unknown }).unsupported === true
}

export function unsupportedResult(method: string): UnsupportedResult {
  return {
    error: { code: JSON_RPC_METHOD_NOT_FOUND, message: `${method} is not available in Vanta Desktop yet` },
    method,
    unsupported: true
  }
}

/** A supported method asked for a key Vanta has no equivalent of. */
export function unsupportedKey(method: string, key: string): UnsupportedResult {
  return {
    ...unsupportedResult(method),
    error: { code: JSON_RPC_METHOD_NOT_FOUND, message: `${method} key "${key}" is not available in Vanta Desktop yet` },
    key
  }
}
