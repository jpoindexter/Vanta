import { useState } from 'react'

import type { OkrsResponse } from '@/api/vanta-company-ops-schemas'

import { VpButton } from '../../ui/button'
import { useCompany } from '../company-context'
import { percent } from '../format'
import { ActionStatus } from '../ui/action-status'
import { useCompanyResource } from '../use-company-resource'

import { CreateOkrDialog } from './create-okr-dialog'
import { ObjectiveList } from './objective-list'
import { useOkrActions } from './use-okr-actions'

/** One line that says how many objectives there are and which key result is furthest behind. */
export function okrSummary({ furthest, objectives }: OkrsResponse): string {
  const count = `${objectives.length} ${objectives.length === 1 ? 'objective' : 'objectives'}`

  return furthest
    ? `${count} · furthest from target: ${furthest.keyResult} (${percent(furthest.gap)} to go)`
    : `${count} · no key results measured yet`
}

export function OkrsTab() {
  const { api } = useCompany()
  const okrs = useCompanyResource(() => api.readOkrs(), [api])
  const actions = useOkrActions()
  const { action } = actions
  const [creating, setCreating] = useState(false)

  const openCreate = () => {
    action.clear()
    setCreating(true)
  }

  const submitCreate: typeof actions.create = async input => {
    const ok = await actions.create(input)

    setCreating(!ok)

    return ok
  }

  return (
    <section aria-label="OKRs" className="vc-section">
      <div className="vc-toolbar">
        <p className="vp-muted" data-testid="okr-summary">
          {okrs.state.status === 'ready' ? okrSummary(okrs.state.data) : ''}
        </p>
        <VpButton data-testid="okr-create-open" onClick={openCreate} variant="primary">
          New objective
        </VpButton>
      </div>
      <ActionStatus error={creating ? null : action.error} notice={action.notice} />
      <ObjectiveList actions={actions} okrs={okrs} onCreate={openCreate} />
      {creating && <CreateOkrDialog action={action} onClose={() => setCreating(false)} onCreate={submitCreate} />}
    </section>
  )
}
