import type { RunRecord, TicketDetail } from '@/api/vanta-company-schemas'

import { clockTime, costText, durationText, NATIVE_RUNTIME, runtimeName } from '../format'

const RUN_WORD = { awaiting_review: 'Awaiting review', done: 'Done', failed: 'Failed', running: 'Running' } as const

function RunRow({ run }: { run: RunRecord }) {
  const cost = costText(run.costUsd, run.costBasis, run.runtime !== NATIVE_RUNTIME)

  return (
    <tr data-testid="run-row">
      <th scope="row">{run.attempt}</th>
      <td>
        {RUN_WORD[run.status]}
        {run.error && <div className="vp-note vp-note--flush">{run.error}</div>}
        {run.summary && <div className="vp-note vp-note--flush">{run.summary}</div>}
      </td>
      <td>
        {run.workerId}
        <div className="vp-note vp-note--flush">
          {[run.runtime === NATIVE_RUNTIME ? null : runtimeName(run.runtime), run.provider, run.model]
            .filter(Boolean)
            .join(' · ') || runtimeName(run.runtime)}
        </div>
      </td>
      <td>{clockTime(run.startedAt)}</td>
      <td>{durationText(run.startedAt, run.finishedAt)}</td>
      <td>
        {cost.amount ?? cost.basis}
        {cost.amount && <div className="vp-note vp-note--flush">{cost.basis}</div>}
      </td>
    </tr>
  )
}

/** Every run of this ticket: who ran it, on what, how long, what it cost, and why it failed. */
export function TicketRuns({ detail }: { detail: TicketDetail }) {
  return (
    <section aria-labelledby="runs-h" className="vc-block">
      <h3 id="runs-h">Run history</h3>
      {detail.runs.length === 0 ? (
        <p className="vp-note vp-note--flush">
          No runs yet. A run starts when the ticket is assigned to an idle worker.
        </p>
      ) : (
        <div className="vc-tablewrap" role="region" aria-label="Run history" tabIndex={0}>
          <table className="vc-table">
            <thead>
              <tr>
                <th scope="col">Attempt</th>
                <th scope="col">Result</th>
                <th scope="col">Worker and model</th>
                <th scope="col">Started</th>
                <th scope="col">Took</th>
                <th scope="col">Cost</th>
              </tr>
            </thead>
            <tbody>
              {detail.runs.map(run => (
                <RunRow key={run.runId} run={run} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
