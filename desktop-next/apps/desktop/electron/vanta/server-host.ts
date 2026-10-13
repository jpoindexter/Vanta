import {
  createHttpTransport,
  type VantaCall,
  type VantaEventHandlers,
  type VantaResult,
  type VantaTransport
} from '../../../shared/src/vanta'

import type { BootProgress } from './shell-state'
import type { LaunchInput, VantaServer } from './launcher'

export interface ServerHostDeps {
  boot: { fail: (error: string) => void; ready: () => void; verifying: () => void }
  launch: (input: LaunchInput) => Promise<VantaServer>
  log: (line: string) => void
  /** Called when the server dies after it was ready. */
  onUnexpectedExit: (exit: { code: null | number; signal: null | string }) => void
}

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

  constructor(private readonly deps: ServerHostDeps) {}

  get baseUrl(): null | string {
    return this.current?.baseUrl ?? null
  }

  /** Start (or replace) the server for a project root. Rejects with the reason the runtime did not come up. */
  start(input: LaunchInput): Promise<void> {
    this.stopCurrent()
    this.intentionalStop = false
    this.lastError = null
    const generation = (this.generation += 1)

    const ready = this.deps.launch(input).then(async server => {
      if (generation !== this.generation) {
        server.stop()
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

    const url = this.baseUrl

    if (!url) {
      throw new Error(this.lastError ?? 'The Vanta runtime is not running.')
    }

    return url
  }

  stop(): void {
    this.intentionalStop = true
    this.stopCurrent()
  }

  /** A transport that outlives restarts. */
  readonly transport: VantaTransport = {
    openEvents: (clientId: string, handlers: VantaEventHandlers) => {
      let stop: (() => void) | undefined
      let cancelled = false

      void this.whenReady().then(transport => {
        if (!cancelled && transport) {
          stop = transport.openEvents(clientId, handlers)
        } else if (!cancelled) {
          handlers.onClose(this.lastError ?? 'the Vanta runtime is not running')
        }
      })

      return () => {
        cancelled = true
        stop?.()
      }
    },
    request: async (call: VantaCall) => {
      const transport = await this.whenReady()

      return transport ? transport.request(call) : unavailable(this.lastError ?? 'the Vanta runtime is not running')
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

  private handleExit(generation: number, exit: { code: null | number; signal: null | string }): void {
    if (generation === this.generation && !this.intentionalStop) {
      this.current = null
      this.lastError = `The Vanta runtime exited (${exit.signal ?? exit.code ?? 'unknown'}).`
      this.deps.boot.fail(this.lastError)
      this.deps.onUnexpectedExit(exit)
    }
  }
}
