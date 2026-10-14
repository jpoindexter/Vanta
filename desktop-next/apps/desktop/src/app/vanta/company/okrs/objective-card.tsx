import { useId } from 'react'

import type { Objective } from '@/api/vanta-company-ops-schemas'

import { percent } from '../format'

import { AddKeyResult } from './add-key-result'
import { KeyResultLine } from './key-result-line'

interface ObjectiveCardProps {
  busy: boolean
  objective: Objective
  onSetCurrent: (objectiveId: string, name: string, current: number) => Promise<boolean>
  onAddKeyResult: (objectiveId: string, name: string, current: number, target: number) => Promise<boolean>
}

/** One objective: its overall progress, each key result with an update field, and Add key result. */
export function ObjectiveCard({ busy, objective, onAddKeyResult, onSetCurrent }: ObjectiveCardProps) {
  const headingId = useId()

  return (
    <article aria-labelledby={headingId} className="vc-product vc-objective" data-testid="objective">
      <div className="vc-meta">
        <h3 id={headingId}>{objective.title}</h3>
        <span className="vc-strong">{percent(objective.progress)}</span>
        {objective.departmentId && <span className="vp-muted">{objective.departmentId} department</span>}
      </div>
      <div aria-hidden className="vc-meter vc-meter--wide">
        <span style={{ width: percent(objective.progress) }} />
      </div>
      {objective.keyResults.length === 0 ? (
        <p className="vp-note vp-note--flush">No key results yet. Add one so progress can be measured.</p>
      ) : (
        <ul aria-label={`Key results of ${objective.title}`} className="vc-krs">
          {objective.keyResults.map(keyResult => (
            <KeyResultLine
              busy={busy}
              key={`${keyResult.name}:${keyResult.current}`}
              keyResult={keyResult}
              onSave={(name, current) => onSetCurrent(objective.id, name, current)}
            />
          ))}
        </ul>
      )}
      <AddKeyResult
        busy={busy}
        objectiveTitle={objective.title}
        onAdd={(name, current, target) => onAddKeyResult(objective.id, name, current, target)}
      />
    </article>
  )
}
