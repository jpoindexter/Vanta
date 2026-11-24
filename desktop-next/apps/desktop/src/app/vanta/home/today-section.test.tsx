import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { VantaApiRequest } from '@/global'
import { installRestBridge } from '@/test/rest-bridge'

import { parseSnapshot, stateLabel } from './today-model'
import { TodaySection } from './today-section'

const ITEM = {
  id: 'c1',
  outcome: 'Get brief.md back on track',
  preparedAction: { preview: 'Reads brief.md. No project files will change.' },
  recommendation: 'Read it once and pick the first fix.',
  state: 'needs human',
  timeCapacityFit: { minutes: 10 }
}

const snapshot = (over: Record<string, unknown> = {}) => ({
  inbox: [],
  support: { capacity: { cognitive: 'low' }, refusal: { active: false } },
  today: [ITEM],
  ...over
})

let calls: VantaApiRequest[]
let answer: (request: VantaApiRequest) => object

beforeEach(() => {
  calls = []
  answer = () => snapshot()
  installRestBridge(request => {
    calls.push(request)

    return answer(request)
  })
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'desktopBridge')
})

describe('parseSnapshot', () => {
  it('reads a snapshot, or the snapshot inside a change answer, and refuses nonsense', () => {
    expect(parseSnapshot(snapshot())?.today[0]?.outcome).toBe('Get brief.md back on track')
    expect(parseSnapshot({ snapshot: snapshot() })?.today).toHaveLength(1)
    expect(parseSnapshot({ nope: true })).toBeNull()
    expect(stateLabel('needs human')).toBe('Needs Human')
  })
})

describe('TodaySection', () => {
  it('shows the top recommendation with its exact preview and capacity', async () => {
    render(<TodaySection />)

    expect(await screen.findByText('Get brief.md back on track')).toBeTruthy()
    expect(screen.getByText(/No project files will change/)).toBeTruthy()
    expect(screen.getByText('10 min')).toBeTruthy()
  })

  it('sends Do it, Show me, Snooze (an hour ahead) and Skip for that item', async () => {
    render(<TodaySection />)
    await screen.findByTestId('today-card')

    for (const name of ['Do it', 'Show me', 'Snooze 1 hour', 'Skip']) {
      fireEvent.click(screen.getByRole('button', { name }))
      await waitFor(() => expect(calls.at(-1)?.method).toBe('POST'))
    }

    const bodies = calls.filter(call => call.method === 'POST').map(call => call.body as Record<string, unknown>)

    expect(bodies.map(body => body.action)).toEqual(['do_it', 'show_me', 'snooze', 'skip'])
    expect(bodies.every(body => body.id === 'c1')).toBe(true)
    expect(Date.parse(String(bodies[2]?.until))).toBeGreaterThan(Date.now() + 59 * 60 * 1000)
  })

  it('captures a thought and clears the box', async () => {
    render(<TodaySection />)
    const box = (await screen.findByLabelText('What do you want off your mind?')) as HTMLInputElement
    fireEvent.change(box, { target: { value: 'call the accountant' } })
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }))

    await waitFor(() => expect(calls.some(call => (call.body as { action?: string } | undefined)?.action === 'capture')).toBe(true))
    await waitFor(() => expect(box.value).toBe(''))
    expect(calls.find(call => call.method === 'POST')?.body).toMatchObject({ action: 'capture', text: 'call the accountant' })
  })

  it('says so, and offers to turn support back on, when it is off', async () => {
    answer = request => (request.method === 'POST' ? snapshot() : snapshot({ support: { capacity: {}, refusal: { active: true, scope: 'session' } }, today: [] }))
    render(<TodaySection />)

    expect(await screen.findByText(/Today support is off \(session\)/)).toBeTruthy()
    expect(screen.queryByTestId('today-card')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Turn back on' }))

    await waitFor(() => expect(calls.at(-1)?.body).toMatchObject({ action: 'on' }))
    expect(await screen.findByTestId('today-card')).toBeTruthy()
  })

  it('turns support off for a chosen scope', async () => {
    render(<TodaySection />)
    await screen.findByTestId('today-card')
    fireEvent.click(screen.getByRole('button', { name: 'Off everywhere' }))

    await waitFor(() => expect(calls.at(-1)?.body).toMatchObject({ action: 'off', scope: 'global' }))
  })

  it('shows an empty line when nothing is asking for attention, and nothing at all when the server has none', async () => {
    answer = () => snapshot({ today: [] })
    const { unmount } = render(<TodaySection />)
    expect(await screen.findByText('Nothing is asking for attention.')).toBeTruthy()
    unmount()

    answer = () => ({ nothing: 'here' })
    const { container } = render(<TodaySection />)
    await waitFor(() => expect(calls.length).toBeGreaterThan(1))
    expect(container.textContent).toBe('')
  })

  it('surfaces a failed action in words', async () => {
    answer = request => {
      if (request.method === 'POST') {
        throw new Error('continuity support is off for global')
      }

      return snapshot()
    }
    render(<TodaySection />)
    await screen.findByTestId('today-card')
    fireEvent.click(screen.getByRole('button', { name: 'Do it' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('continuity support is off for global')
  })
})
