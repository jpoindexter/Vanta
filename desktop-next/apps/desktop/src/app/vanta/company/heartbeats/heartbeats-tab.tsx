import type { HeartbeatsResponse } from '@/api/vanta-company-ops-schemas'
import type { CompanyResponse } from '@/api/vanta-company-schemas'

import { useCompany } from '../company-context'
import { Empty, Loadable } from '../ui/loadable'
import { useCompanyResource } from '../use-company-resource'

import { PipelineRuns } from './pipeline-runs'
import { TickPanel } from './tick-panel'
import { WorkerHeartbeats } from './worker-heartbeats'

interface BodyProps {
  company: CompanyResponse | null
  data: HeartbeatsResponse
  now: number
  onOpenTicket: (id: string) => void
}

function HeartbeatsBody({ company, data, now, onOpenTicket }: BodyProps) {
  return (
    <>
      <h3>Workers</h3>
      {data.workers.length === 0 ? (
        <Empty text="No workers yet, so no heartbeats. Hire one in Workers." />
      ) : (
        <WorkerHeartbeats company={company} data={data} now={now} onOpenTicket={onOpenTicket} />
      )}
      <h3>Wakeup runs</h3>
      <PipelineRuns runs={data.runs} />
      <p className="vp-note">{data.note}</p>
    </>
  )
}

export function HeartbeatsTab({ onOpenTicket }: { onOpenTicket: (id: string) => void }) {
  const { api, now } = useCompany()
  const beats = useCompanyResource(() => api.readHeartbeats(), [api])
  const company = useCompanyResource(() => api.readCompany(), [api])
  const names = company.state.status === 'ready' ? company.state.data : null

  return (
    <section aria-label="Heartbeats" className="vc-section">
      <TickPanel />
      <Loadable errorLabel="Couldn't load heartbeats." onRetry={beats.reload} state={beats.state}>
        {data => <HeartbeatsBody company={names} data={data} now={now()} onOpenTicket={onOpenTicket} />}
      </Loadable>
    </section>
  )
}
