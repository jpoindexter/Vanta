/**
 * Sidebar grouping: Needs you, Pinned, one group per project, then Recent.
 *
 * Pure over its inputs so the order and the "a session appears once" rule are
 * testable without the stores. A session waiting on the user shows under
 * Needs you only; a pinned one under Pinned only; the rest under the project
 * its workspace belongs to (the repo root, else the cwd), or Recent when it has
 * no workspace at all.
 */

import { pathLeaf } from '@/lib/display-path'
import { isNeedsYouStatus, type ShellStatus } from '@/app/shell/vanta/session-status'
import type { ProjectInfo, SessionInfo } from '@/types/desktop'

export type SidebarGroupKind = 'needs-you' | 'pinned' | 'project' | 'recent'

export interface SidebarGroup {
  id: string
  kind: SidebarGroupKind
  label: string
  /** Workspace a "new chat in this project" starts in; null for non-project groups. */
  path: null | string
  sessions: SessionInfo[]
}

export interface GroupInput {
  /** Visible sessions, newest first. */
  sessions: readonly SessionInfo[]
  /** Resolved pinned sessions, in the user's pin order. */
  pinned: readonly SessionInfo[]
  projects: readonly ProjectInfo[]
  statusOf: (session: SessionInfo) => ShellStatus
  /** The project a session files under: a project id or a workspace path. */
  projectKeyOf: (session: SessionInfo) => null | string
}

const recency = (s: SessionInfo) => s.last_active || s.started_at || 0

export function projectGroupLabel(key: string, projects: readonly ProjectInfo[]): { label: string; path: string } {
  const explicit = projects.find(project => project.id === key && !project.archived)

  if (explicit) {
    return { label: explicit.name.trim() || pathLeaf(explicit.primary_path), path: explicit.primary_path ?? '' }
  }

  return { label: pathLeaf(key) || key, path: key }
}

export function buildSidebarGroups(input: GroupInput): SidebarGroup[] {
  const { sessions, pinned, projects, statusOf, projectKeyOf } = input
  const placed = new Set<string>()
  const needs: SessionInfo[] = []

  for (const session of [...pinned, ...sessions]) {
    if (!placed.has(session.id) && isNeedsYouStatus(statusOf(session))) {
      placed.add(session.id)
      needs.push(session)
    }
  }

  const pins = pinned.filter(session => !placed.has(session.id))
  pins.forEach(session => placed.add(session.id))

  const byProject = new Map<string, SessionInfo[]>()
  const recent: SessionInfo[] = []

  for (const session of sessions) {
    if (placed.has(session.id)) {
      continue
    }

    const key = projectKeyOf(session)

    if (!key) {
      recent.push(session)

      continue
    }

    byProject.set(key, [...(byProject.get(key) ?? []), session])
  }

  const groups: SidebarGroup[] = []

  if (needs.length) {
    groups.push({
      id: 'needs-you',
      kind: 'needs-you',
      label: '',
      path: null,
      sessions: needs.sort((a, b) => recency(b) - recency(a))
    })
  }

  if (pins.length) {
    groups.push({ id: 'pinned', kind: 'pinned', label: '', path: null, sessions: pins })
  }

  const projectGroups = [...byProject.entries()]
    .map(([key, rows]) => ({ key, rows, newest: Math.max(...rows.map(recency)) }))
    .sort((a, b) => b.newest - a.newest)

  for (const { key, rows } of projectGroups) {
    const { label, path } = projectGroupLabel(key, projects)

    groups.push({ id: `project:${key}`, kind: 'project', label, path: path || null, sessions: rows })
  }

  if (recent.length) {
    groups.push({ id: 'recent', kind: 'recent', label: '', path: null, sessions: recent })
  }

  return groups
}
