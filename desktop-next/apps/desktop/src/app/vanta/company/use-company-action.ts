import { useCallback, useState } from 'react'

import type { CompanyResult } from '@/api/vanta-company'

import { useCompany } from './company-context'

const DECLINED = 'Declined. Nothing changed.'
const DECLINED_STATUS = 403

export interface RunOptions<T> {
  /** Success text, or a function of the server's reply (for example to mention a run that did not start). */
  done?: ((data: T) => string) | string
  needsApproval?: boolean
}

export interface ActionState {
  busy: boolean
  clear: () => void
  error: null | string
  notice: null | string
  /**
   * Run one write. `needsApproval` shows the owner approval while the server waits on it.
   * Resolves true when the server accepted the write.
   */
  run: <T>(task: () => Promise<CompanyResult<T>>, options?: RunOptions<T>) => Promise<boolean>
}

/** Busy, error and success text for the writes of one screen area. */
export function useCompanyAction(): ActionState {
  const { guard, refresh } = useCompany()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<null | string>(null)
  const [notice, setNotice] = useState<null | string>(null)

  const clear = useCallback(() => {
    setError(null)
    setNotice(null)
  }, [])

  const run = useCallback<ActionState['run']>(
    async <T>(task: () => Promise<CompanyResult<T>>, options: RunOptions<T> = {}) => {
      setBusy(true)
      clear()

      const result = await (options.needsApproval ? guard(task) : task())

      setBusy(false)

      if (result.ok) {
        setNotice(typeof options.done === 'function' ? options.done(result.data) : (options.done ?? null))
        refresh()
      } else {
        setError(result.status === DECLINED_STATUS ? DECLINED : result.message)
      }

      return result.ok
    },
    [clear, guard, refresh]
  )

  return { busy, clear, error, notice, run }
}
