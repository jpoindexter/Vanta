import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'

import type { CompanyApi } from '@/api/vanta-company'

import { type LiveState, useCompanyLive } from './use-company-live'

export interface CompanyContextValue extends LiveState {
  api: CompanyApi
  /** Answer the pending owner approval. Rejects with the server's reason when the answer did not land. */
  decideApproval: (decision: 'allow' | 'deny') => Promise<void>
  /** True while a dialog is open; the dialog then shows the approval itself instead of the page banner. */
  hasDialog: boolean
  now: () => number
  registerDialog: () => () => void
}

const Context = createContext<CompanyContextValue | null>(null)

interface CompanyProviderProps {
  api: CompanyApi
  children: ReactNode
  /** Clock for relative times; tests and the fixtures harness pin it. */
  now?: () => number
}

export function CompanyProvider({ api, children, now = Date.now }: CompanyProviderProps) {
  const live = useCompanyLive(api)
  const [dialogs, setDialogs] = useState(0)
  const { approval, clearApproval } = live

  const decideApproval = useCallback(
    async (decision: 'allow' | 'deny') => {
      if (!approval) {
        return
      }

      const result = await api.decideApproval(approval.id, decision)

      if (!result.ok) {
        throw new Error(result.message)
      }

      clearApproval()
    },
    [api, approval, clearApproval]
  )

  const registerDialog = useCallback(() => {
    setDialogs(count => count + 1)

    return () => setDialogs(count => count - 1)
  }, [])

  const value = useMemo<CompanyContextValue>(
    () => ({ ...live, api, decideApproval, hasDialog: dialogs > 0, now, registerDialog }),
    [api, decideApproval, dialogs, live, now, registerDialog]
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useCompany(): CompanyContextValue {
  const value = useContext(Context)

  if (!value) {
    throw new Error('useCompany needs a CompanyProvider above it. Render the screen through CompanyScreen.')
  }

  return value
}
