import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { expect } from 'vitest'

import type { Scenario } from './fixtures/fake-company-state'
import { FakeCompanyServer } from './fixtures/fake-company-server'
import { ScreenHost } from './fixtures/screen-host'
import type { CompanyLocation } from './company-screen'

interface Options {
  initial?: Partial<CompanyLocation>
  needsApproval?: boolean
  scenario?: Scenario
}

/** Render the Company screen over a fake server and wait for the event stream to open. */
export async function renderCompany({ initial, needsApproval = true, scenario = 'ready' }: Options = {}) {
  const server = new FakeCompanyServer(scenario, needsApproval)
  const view = render(<ScreenHost initial={initial} server={server} />)

  if (scenario !== 'offline') {
    await waitFor(() => expect(server.streams.size).toBeGreaterThan(0))
  }

  return { server, ...view }
}

export const flush = () =>
  act(async () => {
    await Promise.resolve()
  })

// Radix Select asks the DOM for two things jsdom does not have.
function prepareRadixSelect() {
  Element.prototype.scrollIntoView ??= () => undefined
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => undefined
}

const optionFor = (value: string) => document.querySelector<HTMLElement>(`[role="option"][data-value="${value}"]`)

/** Open a VcSelect from the keyboard and pick the row with this value. */
export async function chooseValue(control: HTMLElement, value: string) {
  prepareRadixSelect()
  fireEvent.keyDown(control, { key: 'Enter' })
  await waitFor(() => expect(optionFor(value)).not.toBeNull())
  fireEvent.click(optionFor(value) as HTMLElement)
}

/** The labels a VcSelect offers, in order. Leaves it closed. */
export async function optionLabels(control: HTMLElement): Promise<string[]> {
  prepareRadixSelect()
  fireEvent.keyDown(control, { key: 'Enter' })
  await waitFor(() => expect(document.querySelectorAll('[role="option"]').length).toBeGreaterThan(0))
  const labels = [...document.querySelectorAll('[role="option"]')].map(option => option.textContent ?? '')
  fireEvent.keyDown(control, { key: 'Escape' })

  return labels
}
