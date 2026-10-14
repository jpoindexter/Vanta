import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { hermesApi } from '@/api/client'
import { $sessionFacts } from '@/app/shell/vanta/session-status'
import { ARTIFACTS_ROUTE, CRON_ROUTE } from '@/app/routes'
import { $cronJobs } from '@/store/cron'
import { notifyError } from '@/store/notifications'
import { $projects } from '@/store/projects'
import { $sessions } from '@/store/session'
import { $sessionDotStateById } from '@/store/session-dot-state'

import type { BlockState, HomeActions, HomeBlock, HomeProps } from '../types'

import { companyItemRoute, mergeNeedsYou, useCompanyNeedsYou } from '../company/adapters/company-needs-you'

import {
  type ArtifactEntry,
  needsYouItems,
  nextUpItems,
  projectChips,
  recentOutputItems,
  runningItems
} from './home-model'

export interface HomeWiring {
  /** Approve the one pending approval of a chat, once. */
  allowOnce: (sessionId: string) => Promise<void>
  openSession: (sessionId: string) => void
  revealPath: (path: string) => void
  startTask: (text: string, projectId: null | string) => Promise<void>
  stopRun: (sessionId: string) => Promise<void>
}

const ready = <T>(items: T[]): BlockState<T> => ({ items, status: 'ready' })

function useOutputs(): {
  outputs: BlockState<ArtifactEntry>
  reload: () => void
} {
  const [outputs, setOutputs] = useState<BlockState<ArtifactEntry>>({
    status: 'loading'
  })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let live = true

    hermesApi<ArtifactEntry[]>({ path: '/api/artifacts' })
      .then(entries => live && setOutputs(ready(Array.isArray(entries) ? entries : [])))
      .catch(() => live && setOutputs({ message: 'Outputs did not load.', status: 'error' }))

    return () => {
      live = false
    }
  }, [tick])

  return {
    outputs,
    reload: useCallback(() => setTick(value => value + 1), [])
  }
}

/** Home's four blocks from the stores the sidebar already reads, plus the outputs list. */
export function useHomeProps(wiring: HomeWiring): HomeProps {
  const navigate = useNavigate()
  const sessions = useStore($sessions)
  const dots = useStore($sessionDotStateById)
  const facts = useStore($sessionFacts)
  const jobs = useStore($cronJobs)
  const projects = useStore($projects)
  const { outputs, reload } = useOutputs()
  const company = useCompanyNeedsYou()

  const actions = useMemo<HomeActions>(
    () => ({
      onAllowOnce: id => void wiring.allowOnce(id).catch(error => notifyError(error, 'Could not allow that.')),
      onEditSchedule: () => navigate(CRON_ROUTE),
      onOpenOutput: () => navigate(ARTIFACTS_ROUTE),
      // A company row opens its ticket in the Company screen; a chat row opens the chat.
      onOpenSession: id => {
        const route = companyItemRoute(id)

        route ? navigate(route) : wiring.openSession(id)
      },
      onRetry: (block: HomeBlock) => block === 'recent' && reload(),
      onRevealOutput: id => {
        const entry = outputs.status === 'ready' ? outputs.items.find(item => item.id === id) : undefined

        if (entry) {
          wiring.revealPath(entry.value)
        }
      },
      onRunSchedule: () => navigate(CRON_ROUTE),
      onStopRun: id => void wiring.stopRun(id).catch(error => notifyError(error, 'Could not stop that run.')),
      onSubmitTask: (text, projectId) =>
        void wiring.startTask(text, projectId).catch(error => notifyError(error, 'Could not start that task.'))
    }),
    [navigate, outputs, reload, wiring]
  )

  return useMemo<HomeProps>(() => {
    const input = { dots, facts }

    return {
      actions,
      needsYou: mergeNeedsYou(ready(needsYouItems(sessions, input)), company),
      nextUp: ready(nextUpItems(jobs, Date.now())),
      projects: projectChips(projects),
      recent: outputs.status === 'ready' ? ready(recentOutputItems(outputs.items)) : outputs,
      running: ready(runningItems(sessions, input)),
      starterPrompt: 'Summarize what changed in this project this week'
    }
  }, [actions, company, dots, facts, jobs, outputs, projects, sessions])
}
