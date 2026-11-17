import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { z } from 'zod'

import { DONE_HOLD_MS, type DotFeed, type DotState, nextDotState } from './agent-dot-state'
import type { DotWindow, DotWindowInit } from './agent-dot-window'
import { CH } from './channels'
import type { IpcLike } from './native-handlers'

const fileSchema = z.object({ enabled: z.boolean(), x: z.number().optional(), y: z.number().optional() })
const feedSchema = z.object({ needsInput: z.boolean(), working: z.boolean() })

export interface AgentDotDeps {
  broadcast: (channel: string, payload: unknown) => void
  /** Where a new dot goes when the person has not moved it yet. */
  defaultPosition: () => { x: number; y: number }
  file: string
  focusMain: () => void
  ipc: IpcLike
  log: (line: string) => void
  open: (init: DotWindowInit) => DotWindow
  /** The timer that holds "done" for a moment. Tests pass their own. */
  timers?: { clear: (id: unknown) => void; set: (fn: () => void, ms: number) => unknown }
}

export interface AgentDot {
  dispose: () => void
}

interface Saved {
  enabled: boolean
  x?: number
  y?: number
}

function readSaved(file: string): Saved {
  try {
    const parsed = fileSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')))

    // Off by default: it is a presence the person asks for.
    return parsed.success ? parsed.data : { enabled: false }
  } catch {
    return { enabled: false }
  }
}

/**
 * The agent dot: an optional always-on-top 56 px presence that shows what Vanta is doing and opens it on click. It
 * is driven only by a two-flag report from the main window; it cannot start, stop or approve anything.
 */
export function registerAgentDot(deps: AgentDotDeps): AgentDot {
  const timers = deps.timers ?? { clear: (id: unknown) => clearTimeout(id as NodeJS.Timeout), set: setTimeout }
  let saved = readSaved(deps.file)
  let dot: DotWindow | null = null
  let state: DotState = 'idle'
  let wasWorking = false
  let holdDone: unknown = null

  const save = (): void => {
    try {
      mkdirSync(path.dirname(deps.file), { recursive: true })
      writeFileSync(deps.file, JSON.stringify(saved), 'utf8')
    } catch (error) {
      deps.log(`[agent-dot] could not save the setting: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const show = (next: DotState): void => {
    state = next
    dot?.setState(next)
  }

  const apply = (): void => {
    if (!saved.enabled) {
      dot?.close()
      dot = null

      return
    }

    if (!dot) {
      const at = saved.x !== undefined && saved.y !== undefined ? { x: saved.x, y: saved.y } : deps.defaultPosition()

      dot = deps.open({
        ...at,
        onClick: deps.focusMain,
        onMoved: position => {
          saved = { ...saved, ...position }
          save()
        }
      })
      dot.setState(state)
    }
  }

  const onFeed = (feed: DotFeed): void => {
    const next = nextDotState(feed, wasWorking)
    wasWorking = feed.working || feed.needsInput

    if (holdDone !== null) {
      timers.clear(holdDone)
      holdDone = null
    }

    show(next)

    if (next === 'done') {
      holdDone = timers.set(() => {
        holdDone = null
        show('idle')
      }, DONE_HOLD_MS)
    }
  }

  const status = () => ({ enabled: saved.enabled })

  deps.ipc.handle(CH.dotGet, () => status())

  deps.ipc.handle(CH.dotSet, (_event, value: unknown) => {
    const parsed = z.boolean().safeParse(value)

    if (parsed.success && parsed.data !== saved.enabled) {
      saved = { ...saved, enabled: parsed.data }
      save()
      apply()
      deps.broadcast(CH.dotChanged, status())
    }

    return status()
  })

  deps.ipc.on(CH.dotFeed, (_event, value: unknown) => {
    const parsed = feedSchema.safeParse(value)

    if (parsed.success) onFeed(parsed.data)
  })

  apply()

  return {
    dispose: () => {
      if (holdDone !== null) timers.clear(holdDone)
      dot?.close()
      dot = null
    }
  }
}
