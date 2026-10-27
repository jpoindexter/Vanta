import {
  createHttpTransport,
  type VantaCall,
  type VantaEventHandlers,
  type VantaResult,
  type VantaTransport
} from '../../../shared/src/vanta'

import type { BootProgress } from './shell-state'
import type { LaunchInput, VantaServer } from './launcher'
import { assertLocalRuntime, assertRuntimeProfile, readRuntimeOwner, runtimeRoute } from './runtime-owner'

export interface ServerHostDeps {
  boot: { fail: (error: string) => void; ready: () => void; verifying: () => void }
  launch: (input: LaunchInput) => Promise<VantaServer>
  log: (line: string) => void
  /** Called when the server dies after it was ready. */
  onUnexpectedExit: (exit: { code: null | number; signal: null | string }) => void
  /** The clock the restart limit reads. Tests set it. */
  now?: () => number
  /** How long to wait before starting a runtime that died on its own (0 by default). */
  respawnDelayMs?: number
}

/** A runtime that died on its own is started again when something asks for it, at most this often. */
const RESPAWN_LIMIT = 3
const RESPAWN_WINDOW_MS = 120_000

export type { BootProgress }

const unavailable = (message: string): VantaResult => ({ data: { error: message }, ok: false, status: 0 })

/**
 * Owns the one Vanta server process for the current project. `transport` is stable across restarts:
 * calls wait for the server being started, and fail with the launch error if it never came up.
 */
export class ServerHost {
  private current: null | VantaServer = null
  private launching: null | Promise<VantaTransport> = null
  private intentionalStop = false
  private lastError: null | string = null
  private generation = 0
  private lastInput: LaunchInput | null = null
  private needsRespawn = false
  private respawnTimes: number[] = []
  private respawning: null | Promise<void> = null

  constructor(private readonly deps: ServerHostDeps) {}

  get baseUrl(): null | string {
    return this.current?.baseUrl ?? null
  }

  /** Start (or replace) the server for a project root. Rejects with the reason the runtime did not come up. */
  start(input: LaunchInput): Promise<void> {
    const previous = this.current
    const previousLaunch = this.launching

    previous?.stop()
    this.current = null
    this.lastInput = input
    this.needsRespawn = false
    this.intentionalStop = false
    this.lastError = null
    const generation = (this.generation += 1)

    // The old runtime and the kernel it owns must be gone before the new one starts: both want the same kernel port and home.
    const started =
      previous || previousLaunch
        ? Promise.allSettled([previous?.stopAndWait(), previousLaunch]).then(() => this.deps.launch(input))
        : this.deps.launch(input)

    const ready = started.then(async server => {
      if (generation !== this.generation) {
        await server.stopAndWait()
        throw new Error('The Vanta runtime start was superseded by a newer one.')
      }

      this.deps.boot.verifying()
      this.current = server
      await server.ready
      this.deps.boot.ready()
      void server.exited.then(exit => this.handleExit(generation, exit))

      return createHttpTransport({ baseUrl: server.baseUrl, token: server.token })
    })

    this.launching = ready

    ready.catch(error => {
      if (generation === this.generation) {
        this.lastError = error instanceof Error ? error.message : String(error)
        this.deps.log(`[runtime] ${this.lastError}`)
        this.deps.boot.fail(this.lastError)
      }
    })

    return ready.then(() => undefined)
  }

  /** The server's base URL once it answers, or the reason it never did. Callers outlive restarts: they get the newest server. */
  async baseUrlWhenReady(): Promise<string> {
    const pending = this.launching

    if (!pending) {
      throw new Error('The Vanta runtime has not been started.')
    }

    await pending
    await this.respawnIfNeeded()

    const url = this.baseUrl

    if (!url) {
      throw new Error(this.lastError ?? 'The Vanta runtime is not running.')
    }

    return url
  }

  /**
   * A runtime that was running and then died on its own is started again the next time something asks
   * for the connection (the renderer's Retry does), as the Vanta shell does for its backend. Callers
   * that arrive meanwhile share the one restart. A runtime that keeps dying is left stopped with its
   * last error instead of looping.
   */
  private async respawnIfNeeded(): Promise<void> {
    if (this.respawning) {
      return this.respawning
    }

    if (!this.needsRespawn || this.intentionalStop || this.current || !this.lastInput) {
      return
    }

    const now = this.deps.now?.() ?? Date.now()
    this.respawnTimes = this.respawnTimes.filter(at => now - at < RESPAWN_WINDOW_MS)

    if (this.respawnTimes.length >= RESPAWN_LIMIT) {
      return
    }

    this.respawnTimes.push(now)
    this.deps.log('[runtime] starting again after it exited on its own')
    const input = this.lastInput
    const delay = this.deps.respawnDelayMs ?? 0

    this.respawning = (delay > 0 ? new Promise<void>(resolve => setTimeout(resolve, delay)) : Promise.resolve())
      // Someone may have restarted it meanwhile (an explicit Restart): do not restart a healthy runtime.
      .then(() => (this.needsRespawn && !this.current ? this.start(input) : undefined))
      .catch(() => undefined)
      .finally(() => {
        this.respawning = null
      })

    return this.respawning
  }

  stop(): void {
    this.intentionalStop = true
    this.stopCurrent()
  }

  /**
   * Stop the runtime and everything it started, and wait until they are gone. For quit: a launch that is
   * still in flight stops its own server when it resolves, and this waits for that too.
   */
  async stopAndWait(): Promise<void> {
    this.intentionalStop = true
    this.generation += 1
    const current = this.current

    this.current = null
    await Promise.allSettled([current?.stopAndWait(), this.launching?.catch(() => undefined)])
  }

  /** A transport that outlives restarts. */
  readonly transport: VantaTransport = {
    openEvents: (clientId: string, handlers: VantaEventHandlers, owner) => {
      let stop: (() => void) | undefined
      let cancelled = false

      void this.whenReady().then(async transport => {
        const route = runtimeRoute(owner)
        assertLocalRuntime(route)
        if (transport && route.profile) assertRuntimeProfile(route, await readRuntimeOwner(transport.request))
        if (!cancelled && transport) {
          stop = transport.openEvents(clientId, handlers)
        } else if (!cancelled) {
          handlers.onClose(this.lastError ?? 'the Vanta runtime is not running')
        }
      }).catch(error => {
        if (!cancelled) handlers.onClose(error instanceof Error ? error.message : String(error))
      })

      return () => {
        cancelled = true
        stop?.()
      }
    },
    request: async (call: VantaCall) => {
      try {
        const route = runtimeRoute(call)
        assertLocalRuntime(route)
        const transport = await this.whenReady()
        if (!transport) return unavailable(this.lastError ?? 'the Vanta runtime is not running')
        // Verify and dispatch through this exact transport/token, never a replacement runtime.
        if (route.profile) assertRuntimeProfile(route, await readRuntimeOwner(transport.request))
        return transport.request(call)
      } catch (error) {
        return { data: { error: error instanceof Error ? error.message : String(error) }, ok: false, status: 409 }
      }
    }
  }

  private async whenReady(): Promise<null | VantaTransport> {
    try {
      return (await this.launching) ?? null
    } catch {
      return null
    }
  }

  private stopCurrent(): void {
    this.current?.stop()
    this.current = null
  }

  /**
   * A crash is healed once, quietly: the runtime starts again and nobody is told. Only a runtime that cannot come back
   * (it keeps dying, or the restart fails) fails the boot state and tells the shell, which then shows Restart.
   */
  private async recoverFromExit(message: string, exit: { code: null | number; signal: null | string }): Promise<void> {
    await this.respawnIfNeeded()

    if (this.lastError === null && this.current) {
      this.deps.log('[runtime] restarted after it exited on its own')

      return
    }

    const restartError = this.lastError && this.lastError !== message ? ` Starting it again failed: ${this.lastError}` : ''

    this.deps.boot.fail(`${message}${restartError}`)
    this.deps.onUnexpectedExit(exit)
  }

  private handleExit(generation: number, exit: { code: null | number; signal: null | string }): void {
    if (generation === this.generation && !this.intentionalStop) {
      const output = this.current?.output?.() ?? ''
      const message = `The Vanta runtime exited (${exit.signal ?? exit.code ?? 'unknown'}).${output}`
      this.current = null
      this.needsRespawn = true
      this.lastError = message
      void this.recoverFromExit(message, exit)
    }
  }
}
