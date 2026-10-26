import { z } from 'zod'
import type { IpcRendererLike } from './bridge-core'
import { connectionApi } from './bridge-connection'
import { CH } from './channels'

const LOCAL_SOURCE = { connectionId: 'local', kind: 'local', label: 'This computer', reachable: true }
const rowsSchema = z.array(z.object({ id: z.string().trim().min(1).max(64), isDefault: z.boolean().optional() }))
const routeFor = (profile: string) => ({ connectionId: null, profile })

async function listProfiles(ipc: IpcRendererLike) {
  const result = await ipc.invoke<{ data?: { profiles?: unknown }; ok: boolean }>(CH.request, {
    method: 'GET', path: '/api/profiles'
  })
  if (!result.ok) throw new Error('Vanta could not read the available profiles.')
  return rowsSchema.parse(result.data?.profiles)
}

function profileApi(ipc: IpcRendererLike) {
  const { readProfile } = connectionApi(ipc)
  const listeners = new Set<(route: ReturnType<typeof routeFor> | null) => void>()
  return {
    get: () => readProfile(),
    getDefault: async () => {
      const rows = await listProfiles(ipc)
      const found = rows.find(row => row.isDefault) ?? rows[0]
      return found ? routeFor(found.id) : null
    },
    onDefaultChanged: (callback: (route: ReturnType<typeof routeFor> | null) => void) => {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    remember: readProfile,
    set: readProfile,
    setDefault: async (route: { profile?: unknown }) => {
      const name = typeof route?.profile === 'string' ? route.profile : ''
      const result = await ipc.invoke<{ data?: { error?: string }; ok: boolean }>(CH.request, {
        body: { name }, method: 'POST', path: '/api/profiles/set-default'
      })
      if (!result.ok) throw new Error(result.data?.error ?? 'Vanta could not set that default profile.')
      listeners.forEach(listener => listener(routeFor(name)))
      return routeFor(name)
    }
  }
}

/** Stable profile IDs route work; display-name changes never choose another owner. */
export function singleEntryRegistries(ipc: IpcRendererLike) {
  return {
    connections: { list: () => Promise.resolve({
      connections: [], primary: 'local', secureTokenStorage: false, version: 1
    }) },
    getAgentRoster: async () => ({
      agents: (await listProfiles(ipc)).map(row => ({
        connectionId: LOCAL_SOURCE.connectionId, connectionKind: LOCAL_SOURCE.kind,
        connectionLabel: LOCAL_SOURCE.label, handle: row.id, profile: row.id
      })),
      sources: [LOCAL_SOURCE]
    }),
    profile: profileApi(ipc)
  }
}
