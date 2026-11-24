import net from 'node:net'
import path from 'node:path'
import { realpath } from 'node:fs/promises'
import { z } from 'zod'
import type { VantaTransport } from '../../../shared/src/vanta'
import type { LaunchInput } from './launcher'

const profileSchema = z.object({
  id: z.string().min(1).max(64), home: z.string().min(1),
  status: z.enum(['idle', 'queued', 'archived']),
  model: z.string().nullable(), provider: z.string().nullable()
})
const catalogSchema = z.object({ profiles: z.array(profileSchema) })

/** The backend catalog supplies IDs and configuration; a renderer never supplies a launch path. */
export async function runtimeProfile(profile: string, transport: VantaTransport) {
  const response = await transport.request({ method: 'GET', path: '/api/profiles' })
  if (!response.ok) throw new Error('Vanta could not verify the available profiles.')
  const rows = catalogSchema.parse(response.data).profiles
  const base = rows.find(row => row.id === 'default')
  const selected = rows.find(row => row.id === profile && row.status !== 'archived')
  if (!base || !selected) throw new Error('The requested runtime profile is unavailable.')
  const home = profile === 'default' ? base.home : path.join(base.home, 'profiles', profile)
  if (!path.isAbsolute(base.home) || path.resolve(selected.home) !== path.resolve(home)) {
    throw new Error('The requested profile home does not match its durable identity.')
  }
  const baseHome = await realpath(base.home)
  const canonicalHome = await realpath(home)
  const expected = profile === 'default' ? baseHome : path.join(baseHome, 'profiles', profile)
  if (canonicalHome !== expected) throw new Error('The requested profile home crosses a symlink boundary.')
  return { ...selected, home: canonicalHome, baseHome }
}

export async function freeKernelPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') { server.close(); reject(new Error('No local kernel port')); return }
      server.close(error => error ? reject(error) : resolve(address.port))
    })
  })
}

export function profileLaunchInput(input: LaunchInput, profile: Awaited<ReturnType<typeof runtimeProfile>>, port: number): LaunchInput {
  const env = { ...input.env }
  for (const key of ['VANTA_PROVIDER', 'VANTA_MODEL', 'ARGO_PROVIDER', 'ARGO_MODEL']) delete env[key]
  return { ...input, env: {
    ...env,
    VANTA_PROFILE_BASE_HOME: profile.baseHome,
    VANTA_HOME: profile.home,
    VANTA_PROFILE: profile.id,
    VANTA_KERNEL_URL: 'http://127.0.0.1:' + port,
    VANTA_KERNEL_EPHEMERAL: '1',
    ...(profile.provider ? { VANTA_PROVIDER: profile.provider } : {}),
    ...(profile.model ? { VANTA_MODEL: profile.model } : {})
  } }
}
