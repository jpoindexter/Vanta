import type { IpcRendererLike } from './bridge-core'
import { CH } from './channels'
import type { ConnectionDescriptor } from './shell-state'
import { assertLocalRuntime, assertRuntimeProfile, readRuntimeOwner, runtimeRoute } from './runtime-owner'

/** An explicit owner never falls through to the one currently running backend. */
export function connectionApi(ipc: IpcRendererLike) {
  const describe = async (raw?: unknown) => {
    const route = runtimeRoute(raw)
    assertLocalRuntime(route)
    const profile = await readRuntimeOwner(call => ipc.invoke(CH.request, call))
    assertRuntimeProfile(route, profile)
    return { ...await ipc.invoke<ConnectionDescriptor>(CH.connection), connectionId: 'local', profile }
  }
  return {
    getConnection: describe,
    getConnectionFor: describe,
    getGatewayWsUrl: async (profile?: null | string) => (await describe(profile)).wsUrl,
    getGatewayWsUrlFor: async (route?: unknown) => (await describe(route)).wsUrl,
    readProfile: async (name?: null | string) => ({ profile: (await describe(name)).profile })
  }
}
