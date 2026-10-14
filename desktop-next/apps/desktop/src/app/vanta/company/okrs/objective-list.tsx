import type { OkrsResponse } from '@/api/vanta-company-ops-schemas'

import { VpButton } from '../../ui/button'
import { Empty, Loadable } from '../ui/loadable'
import type { Resource } from '../use-company-resource'

import { ObjectiveCard } from './objective-card'
import type { OkrActions } from './use-okr-actions'

const NO_OBJECTIVES = 'No objectives yet. Set one so your workers have a target to move toward.'

interface ObjectiveListProps {
  actions: OkrActions
  okrs: Resource<OkrsResponse>
  onCreate: () => void
}

/** Loading, error, empty (with New objective) or the objective cards. */
export function ObjectiveList({ actions, okrs, onCreate }: ObjectiveListProps) {
  return (
    <Loadable
      empty={{
        node: (
          <Empty
            action={
              <VpButton onClick={onCreate} variant="primary">
                New objective
              </VpButton>
            }
            text={NO_OBJECTIVES}
          />
        ),
        when: list => list.objectives.length === 0
      }}
      errorLabel="Couldn't load objectives."
      onRetry={okrs.reload}
      state={okrs.state}
    >
      {list => (
        <div className="vc-board-list">
          {list.objectives.map(objective => (
            <ObjectiveCard
              busy={actions.action.busy}
              key={objective.id}
              objective={objective}
              onAddKeyResult={actions.addKeyResult}
              onSetCurrent={actions.setCurrent}
            />
          ))}
        </div>
      )}
    </Loadable>
  )
}
