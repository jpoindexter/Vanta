import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { vantaApi } from '@/api/client'
import { $sessionFacts } from '@/app/shell/vanta/session-status'
import { ARTIFACTS_ROUTE, CRON_ROUTE } from '@/app/routes'
import { $cronJobs } from '@/store/cron'
import { notifyError } from '@/store/notifications'
import { $projects } from '@/store/projects'
import { $sessions } from '@/store/session'
import { $sessionDotStateById } from '@/store/session-dot-state'

import type { BlockState, HomeActions, HomeBlock, HomeProps } from '../types'

import { companyItemRoute, mergeNeedsYou, useCompanyNeedsYou } from '../company/adapters/company-needs-you'
import { reportHomeActionError } from './home-submit-state'

import {
  type ArtifactEntry,
  needsYouItems,
  nextUpItems,
  projectChips,
  recentOutputItems,
  runningItems
} from './home-model'

export interface HomeWiring {
  prepareAttachment: (text: string, projectId: null | string) => Promise<void>
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

    vantaApi<ArtifactEntry[]>({ path: '/api/artifacts' })
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

/** What each Home control does. A company row opens its ticket; a chat row opens the chat. */
function useHomeActions(wiring: HomeWiring, outputs: BlockState<ArtifactEntry>, reload: () => void): HomeActions {
  const navigate = useNavigate()

  return useMemo<HomeActions>(
    () => ({
      onAttachTask: (text, projectId) =>
        void wiring.prepareAttachment(text, projectId).catch(error => notifyError(error, 'Could not open the attachment draft.')),
      onAllowOnce: id => void wiring.allowOnce(id).catch(error => notifyError(error, 'Could not allow that.')),
      onEditSchedule: () => navigate(CRON_ROUTE),
      onOpenOutput: () => navigate(ARTIFACTS_ROUTE),
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
        void wiring.startTask(text, projectId).catch(error => reportHomeActionError(error, 'Could not start that task.'))
    }),
    [navigate, outputs, reload, wiring]
  )
}

/** Home's four blocks from the stores the sidebar already reads, the outputs list and the company's tickets. */
export function useHomeProps(wiring: HomeWiring): HomeProps {
  const sessions = useStore($sessions)
  const dots = useStore($sessionDotStateById)
  const facts = useStore($sessionFacts)
  const jobs = useStore($cronJobs)
  const projects = useStore($projects)
  const { outputs, reload } = useOutputs()
  const company = useCompanyNeedsYou()
  const actions = useHomeActions(wiring, outputs, reload)

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
