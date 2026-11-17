import { type LaunchDeps, type LaunchInput, startVantaServer, type VantaServer } from './launcher'

const MAX_ATTEMPTS = 3

/** The port the runtime was told to bind, from the base URL it was started with. */
const portOf = (server: VantaServer): number => Number(new URL(server.baseUrl).port)

/** True when the runtime died because something else took its port between the probe and the bind. */
export function lostThePort(error: unknown): boolean {
  return Boolean((error as { portInUse?: boolean } | null)?.portInUse)
}

/**
 * Starts the runtime and waits until it answers. The free-port probe closes its socket before the
 * runtime binds, so a second launch can take the same port in that gap; the runtime then exits at once.
 * That is retried on the next port instead of being shown as a dead background service.
 */
export async function startWithPortRetry(
  input: LaunchInput,
  deps: Partial<LaunchDeps> = {},
  attempts: number = MAX_ATTEMPTS
): Promise<VantaServer> {
  let preferredPort = input.preferredPort
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const server = await startVantaServer({ ...input, preferredPort }, deps)

    try {
      await server.ready

      return server
    } catch (error) {
      lastError = error

      if (!lostThePort(error) || attempt === attempts) {
        throw error
      }

      preferredPort = portOf(server) + 1
    }
  }

  throw lastError
}
