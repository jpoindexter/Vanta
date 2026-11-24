import { z } from 'zod'
import type { VantaCall, VantaResult } from '../../../shared/src/vanta'

export const runtimeRouteSchema = z.object({
  connectionId: z.string().trim().min(1).max(128).nullish(),
  profile: z.string().trim().min(1).max(64).nullish()
})
type RuntimeRoute = z.infer<typeof runtimeRouteSchema>
const ownerSchema = z.object({ profile: z.string().trim().min(1).max(64) })
type Request = (call: VantaCall) => Promise<VantaResult>

export function runtimeRoute(raw: unknown): RuntimeRoute {
  return runtimeRouteSchema.parse(typeof raw === 'string' ? { profile: raw } : raw ?? {})
}

export function assertLocalRuntime(route: RuntimeRoute): void {
  if (route.connectionId && route.connectionId !== 'local') {
    throw new Error('The requested device is not connected to this Vanta runtime.')
  }
}

export function assertRuntimeProfile(route: RuntimeRoute, owner: string): void {
  if (route.profile && route.profile !== owner) {
    throw new Error('The requested profile is not running here. Vanta did not switch profiles or use another profile.')
  }
}

export async function readRuntimeOwner(request: Request): Promise<string> {
  const result = await request({ method: 'GET', path: '/api/profiles/current' })
  if (!result.ok) throw new Error('Vanta could not verify the running profile.')
  return ownerSchema.parse(result.data).profile
}
