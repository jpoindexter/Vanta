import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { homeProps } from '../fixtures/data'
import type { HomeProps } from '../types'

import { HomePage } from './home-page'

afterEach(cleanup)

function renderHome(overrides: Partial<HomeProps> = {}, state: Parameters<typeof homeProps>[0] = 'ready') {
  const props = { ...homeProps(state), ...overrides }

  render(<HomePage {...props} />)

  return props
}

describe('HomePage', () => {
  it('shows the four supervision blocks in reading order', () => {
    renderHome()

    const headings = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)

    expect(headings).toEqual(['Needs you 2', 'Running now', 'Next up', 'Recent outputs'])
  })

  it('offers the composer with the wireframe prompt and recent projects', () => {
    renderHome()

    expect(screen.getByPlaceholderText('What should Vanta do?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Research' })).toBeTruthy()
  })

  it('grants Allow once only on rows that carry a single approval', () => {
    renderHome()

    expect(screen.getAllByRole('button', { name: /^Allow once/ })).toHaveLength(1)
  })

  it('routes row actions to their handlers', () => {
    const onAllowOnce = vi.fn()
    const onRunSchedule = vi.fn()
    const onRevealOutput = vi.fn()
    const base = homeProps('ready')

    render(<HomePage {...base} actions={{ ...base.actions, onAllowOnce, onRevealOutput, onRunSchedule }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Allow once: Refactor billing webhooks' }))
    fireEvent.click(screen.getByRole('button', { name: 'Run now: Competitor pricing monitor' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reveal q4-launch-plan.md' }))

    expect(onAllowOnce).toHaveBeenCalledWith('s1')
    expect(onRunSchedule).toHaveBeenCalledWith('m1')
    expect(onRevealOutput).toHaveBeenCalledWith('o1')
  })

  it('says "Nothing needs you." when nothing waits and offers one starter prompt', () => {
    renderHome({}, 'empty')

    expect(screen.getByText('Nothing needs you.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Compare three CRM tools and save a brief' })).toBeTruthy()
  })

  it('shows skeleton rows while a block loads, never the empty copy', () => {
    renderHome({}, 'loading')

    expect(screen.getAllByRole('status').length).toBe(4)
    expect(screen.queryByText('Nothing needs you.')).toBeNull()
  })

  it('retries one failed block without touching the others', () => {
    const onRetry = vi.fn()
    const base = homeProps('ready')

    render(
      <HomePage
        {...base}
        actions={{ ...base.actions, onRetry }}
        recent={{ status: 'error', message: 'Offline' }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(onRetry).toHaveBeenCalledWith('recent')
    expect(screen.getByText('Refactor billing webhooks')).toBeTruthy()
  })

  it('submits the task with the chosen project on Enter and ignores Shift+Enter and empty text', () => {
    const onSubmitTask = vi.fn()
    const base = homeProps('ready')

    render(<HomePage {...base} actions={{ ...base.actions, onSubmitTask }} />)

    const box = screen.getByLabelText('Start a task')

    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onSubmitTask).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Research' }))
    fireEvent.change(box, { target: { value: 'Summarise Downloads' } })
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
    expect(onSubmitTask).not.toHaveBeenCalled()

    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onSubmitTask).toHaveBeenCalledWith('Summarise Downloads', 'research')
    expect((box as HTMLTextAreaElement).value).toBe('')
  })
})
