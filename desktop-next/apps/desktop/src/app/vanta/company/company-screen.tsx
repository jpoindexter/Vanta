import type { CompanyApi } from '@/api/vanta-company'

import { ActivityTab } from './activity/activity-tab'
import { BudgetsTab } from './budgets/budgets-tab'
import { CompanyProvider } from './company-context'
import { COMPANY_TABS, type CompanyTab, COPY } from './copy'
import { HeartbeatsTab } from './heartbeats/heartbeats-tab'
import { OkrsTab } from './okrs/okrs-tab'
import { ProductsTab } from './products/products-tab'
import { TicketsTab } from './tickets/tickets-tab'
import { ApprovalBanner, OfflineBanner } from './ui/banners'
import { CompanyTabs, panelId, tabId } from './ui/tabs'
import { WorkersTab } from './workers/workers-tab'

import '@/styles/vanta-chat.css'
import './company.css'
import './company-ops.css'

export interface CompanyLocation {
  tab: CompanyTab
  ticketId: null | string
}

export interface CompanyScreenProps {
  api: CompanyApi
  location: CompanyLocation
  onNavigate: (next: CompanyLocation) => void
  /** Clock for relative times. The fixtures harness pins it so screenshots repeat. */
  now?: () => number
}

export function parseTab(value: null | string): CompanyTab {
  return COMPANY_TABS.find(tab => tab === value) ?? 'workers'
}

function Panel({ location, onNavigate }: Pick<CompanyScreenProps, 'location' | 'onNavigate'>) {
  const openTicket = (ticketId: null | string) => onNavigate({ tab: 'tickets', ticketId })

  switch (location.tab) {
    case 'tickets':
      return <TicketsTab onSelectTicket={openTicket} ticketId={location.ticketId} />

    case 'okrs':
      return <OkrsTab />

    case 'heartbeats':
      return <HeartbeatsTab onOpenTicket={openTicket} />

    case 'products':
      return <ProductsTab onOpenTicket={openTicket} />

    case 'budgets':
      return <BudgetsTab />

    case 'activity':
      return <ActivityTab onOpenTicket={openTicket} />

    default:
      return <WorkersTab onOpenTicket={openTicket} />
  }
}

/** The Company page: workers, tickets, budgets and activity of the company, live from the Vanta server. */
export function CompanyScreen({ api, location, now, onNavigate }: CompanyScreenProps) {
  return (
    <CompanyProvider api={api} now={now}>
      <div aria-label={COPY.pageTitle} className="vp vc-page" data-testid="company-page" role="region">
        <div className="vc-col">
          <div>
            <h2 className="vp-page-title">{COPY.pageTitle}</h2>
            <p className="vp-muted">{COPY.pageSubtitle}</p>
          </div>
          <OfflineBanner />
          <ApprovalBanner />
          <CompanyTabs onChange={tab => onNavigate({ tab, ticketId: null })} tab={location.tab} />
          <div aria-labelledby={tabId(location.tab)} id={panelId} role="tabpanel">
            <Panel location={location} onNavigate={onNavigate} />
          </div>
        </div>
      </div>
    </CompanyProvider>
  )
}
