import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { registerAgentDot } from './agent-dot'
import { DONE_HOLD_MS, dotHtml, dotLabel, nextDotState } from './agent-dot-state'
import type { DotWindow, DotWindowInit } from './agent-dot-window'
import { CH } from './channels'
import type { IpcLike } from './native-handlers'

describe('nextDotState', () => {
  it('shows needs-you before anything else, then working, and done once after a run ends', () => {
    expect(nextDotState({ needsInput: true, working: true }, true)).toBe('needs-you')
    expect(nextDotState({ needsInput: false, working: true }, false)).toBe('working')
    expect(nextDotState({ needsInput: false, working: false }, true)).toBe('done')
    expect(nextDotState({ needsInput: false, working: false }, false)).toBe('idle')
  })

  it('has a spoken label for every state', () => {
    expect(['idle', 'working', 'needs-you', 'done'].map(state => dotLabel(state as never)).every(label => label.includes('Vanta'))).toBe(true)
  })

  it('renders a static page that holds no network or script sources', () => {
    const html = dotHtml('idle')

    expect(html).toContain('vanta-dot://click')
    expect(html).not.toMatch(/https?:\/\//)
    expect(html).not.toMatch(/<script[^>]*src=/)
  })
})

describe('registerAgentDot', () => {
  let dir: string
  let file: string
  let handlers: Map<string, (...args: unknown[]) => unknown>
  let opened: DotWindowInit[]
  let states: string[]
  let closed: number
  let timers: Array<{ fn: () => void; ms: number }>
  const broadcast = vi.fn()
  const focusMain = vi.fn()

  const make = () => {
    handlers = new Map()
    const ipc = {
      handle: (channel: string, fn: never) => void handlers.set(channel, fn),
      on: (channel: string, fn: never) => void handlers.set(channel, fn)
    } as IpcLike

    return registerAgentDot({
      broadcast,
      defaultPosition: () => ({ x: 100, y: 200 }),
      file,
      focusMain,
      ipc,
      log: vi.fn(),
      open: init => {
        opened.push(init)

        return { close: () => void (closed += 1), setState: state => void states.push(state) } satisfies DotWindow
      },
      timers: { clear: () => undefined, set: (fn, ms) => void timers.push({ fn, ms }) }
    })
  }

  const call = (channel: string, value?: unknown) => handlers.get(channel)?.({ sender: null }, value)

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'agent-dot-'))
    file = path.join(dir, 'agent-dot.json')
    opened = []
    states = []
    closed = 0
    timers = []
    broadcast.mockClear()
    focusMain.mockClear()
  })

  afterEach(() => rmSync(dir, { force: true, recursive: true }))

  it('is off by default and opens nothing', () => {
    make()

    expect(opened).toEqual([])
    expect(call(CH.dotGet)).toEqual({ enabled: false })
  })

  it('opens at the default spot when turned on, saves the choice, and closes when turned off', () => {
    make()
    call(CH.dotSet, true)

    expect(opened).toHaveLength(1)
    expect(opened[0]).toMatchObject({ x: 100, y: 200 })
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ enabled: true })
    expect(broadcast).toHaveBeenCalledWith(CH.dotChanged, { enabled: true })

    call(CH.dotSet, false)
    expect(closed).toBe(1)
  })

  it('comes back where the person left it, and ignores a malformed setting', () => {
    writeFileSync(file, JSON.stringify({ enabled: true, x: 5, y: 6 }))
    make()
    expect(opened[0]).toMatchObject({ x: 5, y: 6 })

    call(CH.dotSet, 'yes')
    expect(call(CH.dotGet)).toEqual({ enabled: true })
  })

  it('remembers a drag', () => {
    writeFileSync(file, JSON.stringify({ enabled: true }))
    make()
    opened[0]?.onMoved({ x: 40, y: 50 })

    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ enabled: true, x: 40, y: 50 })
  })

  it('opens Vanta when the dot is clicked', () => {
    writeFileSync(file, JSON.stringify({ enabled: true }))
    make()
    opened[0]?.onClick()

    expect(focusMain).toHaveBeenCalledOnce()
  })

  it('follows the feed: working, needs-you, then done for a moment, then idle', () => {
    writeFileSync(file, JSON.stringify({ enabled: true }))
    make()
    call(CH.dotFeed, { needsInput: false, working: true })
    call(CH.dotFeed, { needsInput: true, working: true })
    call(CH.dotFeed, { needsInput: false, working: false })

    expect(states).toEqual(['idle', 'working', 'needs-you', 'done'])
    expect(timers).toHaveLength(1)
    expect(timers[0]?.ms).toBe(DONE_HOLD_MS)

    timers[0]?.fn()
    expect(states.at(-1)).toBe('idle')
  })

  it('ignores a malformed feed', () => {
    writeFileSync(file, JSON.stringify({ enabled: true }))
    make()
    call(CH.dotFeed, { working: 'yes' })

    expect(states).toEqual(['idle'])
  })
})
