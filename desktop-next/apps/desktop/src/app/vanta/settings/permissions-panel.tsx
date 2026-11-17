import { useState } from 'react'

import { SETTINGS_COPY } from '../copy'
import type { ProjectApprovals } from '../types'
import { VpButton } from '../ui/button'
import { VpRow } from '../ui/row'

interface PermissionsPanelProps {
  approvals: ProjectApprovals[]
  onRevoke: (approvalId: string) => Promise<void>
}

/** Remembered approvals per project, each revocable. A failed revoke keeps the row and says so. */
export function PermissionsPanel({ approvals, onRevoke }: PermissionsPanelProps) {
  const [revoked, setRevoked] = useState<ReadonlySet<string>>(new Set())
  const [failedId, setFailedId] = useState<null | string>(null)

  const revoke = async (id: string) => {
    setFailedId(null)

    try {
      await onRevoke(id)
      setRevoked(prev => new Set(prev).add(id))
    } catch {
      setFailedId(id)
    }
  }

  const groups = approvals
    .map(group => ({ ...group, approvals: group.approvals.filter(a => !revoked.has(a.id)) }))
    .filter(group => group.approvals.length > 0)

  if (groups.length === 0) {
    return <p className="vp-empty-line">{SETTINGS_COPY.noApprovals}</p>
  }

  return (
    <>
      {groups.map(group => (
        <section aria-label={group.projectName} key={group.projectId}>
          <h3 className="vp-group-title">{group.projectName}</h3>
          <div className="vp-box" role="list">
            {group.approvals.map(approval => (
              <div key={approval.id}>
                <VpRow
                  actions={
                    <VpButton
                      aria-label={`${SETTINGS_COPY.revoke} ${approval.scope} in ${group.projectName}`}
                      onClick={() => void revoke(approval.id)}
                    >
                      {SETTINGS_COPY.revoke}
                    </VpButton>
                  }
                  detail={`Always allowed in the ${group.projectName} project`}
                  title={approval.scope}
                />
                {failedId === approval.id && (
                  <p className="vp-error" role="alert">
                    {SETTINGS_COPY.revokeFailed}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  )
}
