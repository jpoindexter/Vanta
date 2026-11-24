import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { sharedCompanyApi } from '@/api/vanta-company'

import { COPY } from './copy'
import { type CompanyLocation, CompanyScreen, parseTab } from './company-screen'

/** The `/company` route: reads the tab and ticket from the URL so a link lands on the exact ticket. */
export function CompanyView() {
  const [params, setParams] = useSearchParams()
  const api = useMemo(() => sharedCompanyApi(), [])
  const location = useMemo<CompanyLocation>(
    () => ({ tab: parseTab(params.get('tab')), ticketId: params.get('ticket') }),
    [params]
  )

  const navigate = useCallback(
    (next: CompanyLocation) =>
      setParams({ tab: next.tab, ...(next.ticketId ? { ticket: next.ticketId } : {}) }, { replace: false }),
    [setParams]
  )

  if (!api) {
    return (
      <div className="vp-scroll">
        <div className="vp vc-page" role="region" aria-label={COPY.pageTitle}>
          <div className="vc-col">
            <h2 className="vp-page-title">{COPY.pageTitle}</h2>
            <p className="vp-muted" role="alert">
              The company needs the Vanta desktop app. Open it from the Vanta app, not a browser tab.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="vp-scroll">
      <CompanyScreen api={api} location={location} onNavigate={navigate} />
    </div>
  )
}
