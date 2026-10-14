import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useState } from 'react'

import { acknowledgeFullAccess, isFullAccessAcknowledged } from '@/store/full-access-warning'
import { notifyError } from '@/store/notifications'
import {
  $permissionMode,
  $permissionRoot,
  $permissionStatus,
  applyPermissionMode,
  type PermissionMode,
  permissionModeLabel,
  type PermissionRequester,
  syncPermissionMode
} from '@/store/permission-mode'

/** Reads the project's real mode and turns a menu pick into a server write, with the Full access warning first. */
export function usePermissionChoice(request: PermissionRequester, sessionId: null | string) {
  const mode = useStore($permissionMode)
  const status = useStore($permissionStatus)
  const root = useStore($permissionRoot)
  const [confirmingFull, setConfirmingFull] = useState(false)
  const known = status === 'ready'

  useEffect(() => {
    void syncPermissionMode(request, sessionId)
  }, [request, sessionId])

  const commit = useCallback(
    async (next: PermissionMode, acknowledged = false) => {
      await applyPermissionMode(request, next, { acknowledged, sessionId })
    },
    [request, sessionId]
  )

  const choose = (next: PermissionMode) => {
    if (next === mode && known) {
      return
    }

    if (next === 'full' && !isFullAccessAcknowledged(root)) {
      setConfirmingFull(true)

      return
    }

    void commit(next, next === 'full').catch(error => notifyError(error, 'Could not change the access mode'))
  }

  const confirmFull = async () => {
    await commit('full', true)
    acknowledgeFullAccess(root)
    setConfirmingFull(false)
  }

  return {
    cancelFull: () => setConfirmingFull(false),
    choose,
    confirmFull,
    confirmingFull,
    known,
    label: known ? permissionModeLabel(mode) : 'Access mode',
    mode,
    root
  }
}
