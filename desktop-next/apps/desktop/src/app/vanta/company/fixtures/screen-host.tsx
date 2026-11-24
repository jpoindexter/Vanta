import { useMemo, useState } from 'react'

import { createCompanyApi } from '@/api/vanta-company'

import { type CompanyLocation, CompanyScreen } from '../company-screen'

import type { FakeCompanyServer } from './fake-company-server'
import { fixtureNow } from './recorded'

interface ScreenHostProps {
  initial?: Partial<CompanyLocation>
  server: FakeCompanyServer
}

/** The Company screen over a fake server, holding its own location (the route's job in the app). */
export function ScreenHost({ initial, server }: ScreenHostProps) {
  const [location, setLocation] = useState<CompanyLocation>({ tab: 'workers', ticketId: null, ...initial })
  const api = useMemo(() => createCompanyApi(server), [server])
  const now = useMemo(() => fixtureNow(), [])

  return <CompanyScreen api={api} location={location} now={() => now} onNavigate={setLocation} />
}
