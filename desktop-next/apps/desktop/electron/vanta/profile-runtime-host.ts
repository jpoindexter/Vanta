import type { VantaCall, VantaOwnerRoute, VantaResult, VantaTransport } from '../../../shared/src/vanta'
import { safeApiPath } from '../../../shared/src/vanta'
import { ServerHost, type ServerHostDeps } from './server-host'
import type { LaunchInput } from './launcher'
import { assertLocalRuntime, readRuntimeOwner, runtimeRoute } from './runtime-owner'
import { freeKernelPort, profileLaunchInput, runtimeProfile } from './profile-runtime-input'
import { RuntimeClientOwners } from './runtime-client-owners'
import type { NativeActionTarget } from './native-action-target'

const MAX_PROFILE_RUNTIMES = 8

function apiPathname(call: VantaCall): string | null {
  const safe = safeApiPath(call.path)
  return safe === null ? null : new URL(safe, 'http://vanta.invalid').pathname
}

/** A lazy set of existing ServerHosts; selecting a profile never replaces another profile's work. */
export class ProfileRuntimeHost {
  private readonly primary: ServerHost
  private readonly children = new Map<string, Promise<ServerHost>>()
  private readonly owners = new RuntimeClientOwners()
  private readonly ports = new Set<number>()
  private input: LaunchInput | null = null
  private generation = 0
  private stopped = true
  private launchTail: Promise<unknown> = Promise.resolve()
  private stopping: Promise<void> = Promise.resolve()

  constructor(private readonly deps: ServerHostDeps) { this.primary = new ServerHost(deps) }

  async start(input: LaunchInput): Promise<void> {
    const stopping = this.stopAndWait(), generation = this.generation
    await stopping
    if (generation !== this.generation) throw new Error('The requested runtime start was superseded.')
    this.input = input
    this.stopped = false
    await this.primary.start(input)
  }

  async baseUrlWhenReady(owner?: unknown): Promise<string> {
    return (await this.hostFor(runtimeRoute(owner))).baseUrlWhenReady()
  }

  private checkGeneration(generation: number): void {
    if (this.stopped || generation !== this.generation) throw new Error('The requested runtime start was superseded.')
  }

  private async createProfile(profile: string, generation: number): Promise<ServerHost> {
    this.checkGeneration(generation)
    const input = this.input
    if (!input) throw new Error('The Vanta runtime has not been started.')
    const selected = await runtimeProfile(profile, this.primary.transport)
    let port = await freeKernelPort()
    while (this.ports.has(port)) port = await freeKernelPort()
    this.ports.add(port)
    this.checkGeneration(generation)
    const host = new ServerHost({ ...this.deps,
      boot: { ready: () => {}, verifying: () => {}, fail: message => this.deps.log('[profile] ' + message) },
      onUnexpectedExit: () => this.deps.log('A profile runtime stopped; its stream must reconnect.')
    })
    try {
      await host.start(profileLaunchInput(input, selected, port))
      this.checkGeneration(generation)
      return host
    } catch (error) { await host.stopAndWait(); throw error }
  }

  private async hostFor(raw: VantaOwnerRoute): Promise<ServerHost> {
    const generation = this.generation
    assertLocalRuntime(raw)
    this.checkGeneration(generation)
    if (!raw.profile) return this.primary
    await runtimeProfile(raw.profile, this.primary.transport)
    const primaryOwner = await readRuntimeOwner(this.primary.transport.request)
    this.checkGeneration(generation)
    if (primaryOwner === raw.profile) return this.primary
    let pending = this.children.get(raw.profile)
    if (!pending) {
      if (this.children.size >= MAX_PROFILE_RUNTIMES) throw new Error('The profile runtime limit is reached; no running work was evicted.')
      pending = this.launchTail.then(() => this.createProfile(raw.profile!, generation))
      this.launchTail = pending.catch(() => undefined)
      this.children.set(raw.profile, pending)
      const entry = pending
      void pending.catch(() => { if (this.children.get(raw.profile!) === entry) this.children.delete(raw.profile!) })
    }
    return pending
  }

  private routeFor(call: VantaCall): VantaOwnerRoute {
    const route = runtimeRoute(call)
    const terminal = apiPathname(call) === '/api/terminal'
    if (terminal && !route.profile && !call.clientId) {
      throw new Error('No verified chat owner is available for this command.')
    }
    if (!route.profile && call.clientId) {
      const profile = this.owners.profile(call.clientId)
      if (profile) route.profile = profile
      else if (terminal) throw new Error('No verified chat owner is available for this command.')
    }
    return route
  }

  captureNativeTarget(clientId: string): NativeActionTarget | undefined {
    this.checkGeneration(this.generation)
    const captured = this.owners.capture(clientId)
    return captured ? Object.freeze({ clientId, connectionId: 'local' as const, ...captured, generation: this.generation }) : undefined
  }

  private assertNativeTarget(target: NativeActionTarget): void {
    this.checkGeneration(target.generation)
    if (!this.owners.matches(target.clientId, target.profile, target.lease)) throw new Error('The original chat owner is no longer active; this native action was not run.')
  }

  readonly requestNative = (call: VantaCall, target: NativeActionTarget) => this.dispatch(call, target)

  private async dispatch(call: VantaCall, target?: NativeActionTarget): Promise<VantaResult> {
      try {
        const generation = this.generation
        const route = target ? { connectionId: target.connectionId, profile: target.profile } : this.routeFor(call)
        assertLocalRuntime(route)
        // This catalog describes the base identity, not the foreground profile's inherited environment.
        const catalog = call.method === 'GET' && apiPathname(call) === '/api/profiles'
        const host = catalog ? this.primary : await this.hostFor(route)
        if (route.profile) await runtimeProfile(route.profile, this.primary.transport)
        this.checkGeneration(generation)
        return await host.requestBound({ ...call, ...route, ...(catalog ? { profile: undefined } : {}), ...(target ? { clientId: target.clientId } : {}) },
          target ? () => this.assertNativeTarget(target) : undefined)
      } catch (error) {
        return { data: { error: error instanceof Error ? error.message : String(error) }, ok: false, status: 409 }
      }
  }

  readonly transport: VantaTransport = {
    request: call => this.dispatch(call),
    openEvents: (clientId, handlers, owner) => {
      let cancelled = false, stop = () => {}, release = () => {}
      const generation = this.generation
      void this.hostFor(runtimeRoute(owner)).then(async host => {
        const profile = await readRuntimeOwner(host.transport.request)
        await runtimeProfile(profile, this.primary.transport)
        this.checkGeneration(generation)
        if (cancelled) return
        release = this.owners.bind(clientId, profile)
        stop = host.transport.openEvents(clientId, { ...handlers, onClose: reason => { release(); handlers.onClose(reason) } },
          { connectionId: 'local', profile })
      }).catch(error => { if (!cancelled) handlers.onClose(error instanceof Error ? error.message : String(error)) })
      return () => { cancelled = true; stop(); release() }
    }
  }

  stop(): void {
    void this.stopAndWait()
  }

  stopAndWait(): Promise<void> {
    this.stopped = true
    this.generation += 1
    this.owners.clear()
    const children = [...this.children.values()]
    this.children.clear()
    this.stopping = Promise.allSettled([this.stopping, this.primary.stopAndWait(),
      ...children.map(async pending => (await pending).stopAndWait())]).then(() => { this.ports.clear() })
    return this.stopping
  }
}
