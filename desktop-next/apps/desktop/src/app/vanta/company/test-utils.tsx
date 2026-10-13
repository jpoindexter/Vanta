import { act, render, waitFor } from '@testing-library/react'
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
