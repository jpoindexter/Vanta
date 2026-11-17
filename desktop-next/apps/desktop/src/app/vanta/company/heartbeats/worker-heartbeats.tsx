import type { CompanyResponse, CompanyWorker } from '@/api/vanta-company-schemas'
import type { HeartbeatsResponse } from '@/api/vanta-company-ops-schemas'

import { clockTime, relativeTime } from '../format'
import { WorkerStatusMark } from '../ui/status-mark'

import { SOURCE_WORD } from './beat-words'

interface WorkerHeartbeatsProps {
  company: CompanyResponse | null
  data: HeartbeatsResponse
  now: number
  onOpenTicket: (id: string) => void
}

function TicketLink({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  return (
    <button aria-label={`Open ticket ${id}`} className="vc-link vc-id" onClick={() => onOpen(id)} type="button">
      {id}
    </button>
  )
}

/** The next queued ticket, as text: Vanta keeps no next-run clock, so "next" means what the worker picks up next. */
function NextUp({ onOpen, worker }: { onOpen: (id: string) => void; worker?: CompanyWorker }) {
  const [first, ...rest] = worker?.queuedTicketIds ?? []

  if (!first) {
    return <span className="vp-muted">Nothing queued</span>
  }

  return (
    <>
      <TicketLink id={first} onOpen={onOpen} />
      {rest.length > 0 && <span className="vp-note vp-note--flush"> and {rest.length} more queued</span>}
    </>
  )
}

export function WorkerHeartbeats({ company, data, now, onOpenTicket }: WorkerHeartbeatsProps) {
  return (
    <div aria-label="Worker heartbeats" className="vc-tablewrap" role="region" tabIndex={0}>
      <table className="vc-table">
        <caption className="sr-only">Last heartbeat, current ticket and next queued ticket of each worker</caption>
        <thead>
          <tr>
            {['Worker', 'Status', 'Last heartbeat', 'Working on', 'Next up'].map(name => (
              <th key={name} scope="col">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.workers.map(beat => {
            const worker = company?.workers.find(candidate => candidate.id === beat.workerId)

            return (
              <tr data-testid="heartbeat-row" key={beat.workerId}>
                <th scope="row">{worker?.name ?? beat.workerId}</th>
                <td>{worker ? <WorkerStatusMark status={worker.status} /> : <span className="vp-muted">Unknown</span>}</td>
                <td>
                  {beat.lastHeartbeat ? (
                    <>
                      <div title={clockTime(beat.lastHeartbeat)}>{relativeTime(beat.lastHeartbeat, now)}</div>
                      <div className="vp-note vp-note--flush">{SOURCE_WORD[beat.source]}</div>
                    </>
                  ) : (
                    <span className="vp-muted">No heartbeat yet</span>
                  )}
                </td>
                <td>
                  {beat.currentTicketId ? (
                    <TicketLink id={beat.currentTicketId} onOpen={onOpenTicket} />
                  ) : (
                    <span className="vp-muted">None</span>
                  )}
                </td>
                <td>
                  <NextUp onOpen={onOpenTicket} worker={worker} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
