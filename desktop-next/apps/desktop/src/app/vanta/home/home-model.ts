import { jobState } from '@/app/cron/job-state'
import { isNeedsYouStatus, type SessionFact, shellStatusFor } from '@/app/shell/vanta/session-status'
import { sessionTitle } from '@/lib/chat-runtime'
import type { SessionDotState } from '@/store/session-dot-state'
import type { CronJob, ProjectInfo, SessionInfo } from '@/types/desktop'

import { cronJobToRow } from '../adapters/cron-rows'
import type { NeedsYouItem, NextUpItem, ProjectChip, RecentOutputItem, RunningItem } from '../types'

const MAX_ROWS = 5

/** One output the server found in a session (`GET /api/artifacts`). */
export interface ArtifactEntry {
  id: string
  kind: string
  label: string
  value: string
  sessionId?: string
}

interface SessionFacts {
  dots: Readonly<Record<string, SessionDotState>>
  facts: Readonly<Record<string, SessionFact>>
}

const statusOf = (session: SessionInfo, { dots, facts }: SessionFacts) =>
  shellStatusFor(dots[session.id], facts[session.id])

export function needsYouItems(sessions: readonly SessionInfo[], input: SessionFacts): NeedsYouItem[] {
  return sessions
    .filter(session => isNeedsYouStatus(statusOf(session, input)))
    .slice(0, MAX_ROWS)
    .map(session => {
      const approval = input.facts[session.id] === 'approval'

      return {
        canAllowOnce: approval,
        detail: approval ? 'Waiting for your approval' : 'Needs your input',
        id: session.id,
        title: sessionTitle(session)
      }
    })
}

export function runningItems(sessions: readonly SessionInfo[], input: SessionFacts): RunningItem[] {
  return sessions
    .filter(session => statusOf(session, input) === 'running')
    .slice(0, MAX_ROWS)
    .map(session => ({
      detail: 'Running now',
      id: session.id,
      title: sessionTitle(session)
    }))
}

export function nextUpItems(jobs: readonly CronJob[], nowMs: number): NextUpItem[] {
  return jobs
    .filter(job => jobState(job) !== 'paused')
    .slice(0, MAX_ROWS)
    .map(job => {
      const row = cronJobToRow(job, { nowMs })

      return {
        action: row.actionLabel === 'Run now' ? 'run' : 'edit',
        detail: row.detail,
        id: row.id,
        title: row.title
      }
    })
}

export function recentOutputItems(entries: readonly ArtifactEntry[]): RecentOutputItem[] {
  return entries
    .filter(entry => entry.kind === 'file' || entry.kind === 'canvas')
    .slice(-MAX_ROWS)
    .reverse()
    .map(entry => ({ id: entry.id, name: entry.label }))
}

export function projectChips(projects: readonly ProjectInfo[]): ProjectChip[] {
  return projects
    .filter(project => !project.archived)
    .map(project => ({
      id: project.id,
      name: project.name.trim() || project.primary_path || project.id
    }))
}
