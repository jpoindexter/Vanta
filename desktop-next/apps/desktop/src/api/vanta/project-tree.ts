import type { SessionInfo } from '@/types/desktop'

// The sidebar's project lanes read a ready-made tree (`projects.tree`): project -> repo -> lane -> sessions.
// Vanta stores named projects (a folder each) and sessions (the folder each started in), so the tree is
// computed here from those two lists: a session belongs to the project whose folder is the longest
// prefix of its own folder; a session in no project's folder gets an automatic project for its folder;
// a session with no recorded folder goes to Home.

export const NO_PROJECT_ID = '__no_project__'

export interface ProjectEntry {
  /** The working folder the server runs in, listed so a fresh install still shows where it is; never stored. */
  derived?: boolean
  id: string
  name: string
  path: string
}

interface Lane {
  id: string
  isGit: false
  isHome?: boolean
  isMain: boolean
  label: string
  path: null | string
  sessions: SessionInfo[]
}

interface Repo {
  groups: Lane[]
  id: string
  label: string
  path: null | string
  sessionCount: number
}

export interface ProjectNode {
  isAuto?: boolean
  isNoProject?: boolean
  id: string
  label: string
  lastActive: number
  path: null | string
  previewSessions: SessionInfo[]
  repos: Repo[]
  sessionCount: number
  sessionIds: string[]
  totalCostUsd: number
  totalTokens: number
}

const trimPath = (path: string): string => path.replace(/[\\/]+$/, '')

const leaf = (path: string): string => trimPath(path).split(/[\\/]/).filter(Boolean).at(-1) ?? path

const isUnder = (root: string, folder: string): boolean => {
  const base = trimPath(root)
  const target = trimPath(folder)

  return Boolean(base) && (target === base || target.startsWith(`${base}/`) || target.startsWith(`${base}\\`))
}

const recency = (session: SessionInfo): number => session.last_active || session.started_at || 0

const newestFirst = (a: SessionInfo, b: SessionInfo): number => recency(b) - recency(a)

/** The project whose folder is the longest prefix of `cwd`, or null. */
function ownerOf(cwd: string, projects: readonly ProjectEntry[]): ProjectEntry | null {
  let best: ProjectEntry | null = null

  for (const project of projects) {
    if (isUnder(project.path, cwd) && (!best || trimPath(project.path).length > trimPath(best.path).length)) {
      best = project
    }
  }

  return best
}

function laneFor(root: string, folder: string, sessions: SessionInfo[]): Lane {
  const atRoot = trimPath(folder) === trimPath(root)

  return {
    id: atRoot ? `${root}::branch::` : folder,
    isGit: false,
    ...(atRoot ? { isHome: true } : {}),
    isMain: atRoot,
    label: leaf(folder),
    path: folder,
    sessions: [...sessions].sort(newestFirst)
  }
}

function node(
  base: { id: string; label: string; path: null | string },
  lanes: Lane[],
  flags: Pick<ProjectNode, 'isAuto' | 'isNoProject'>,
  previewLimit: number
): ProjectNode {
  const rows = lanes.flatMap(lane => lane.sessions).sort(newestFirst)

  return {
    ...base,
    ...flags,
    lastActive: rows.reduce((max, row) => Math.max(max, recency(row)), 0),
    previewSessions: rows.slice(0, previewLimit),
    repos: [{ groups: lanes, id: base.id, label: base.label, path: base.path, sessionCount: rows.length }],
    sessionCount: rows.length,
    sessionIds: rows.map(row => row.id),
    totalCostUsd: 0,
    totalTokens: rows.reduce((sum, row) => sum + row.input_tokens + row.output_tokens, 0)
  }
}

function groupByFolder(rows: SessionInfo[]): Map<string, SessionInfo[]> {
  const byFolder = new Map<string, SessionInfo[]>()

  for (const row of rows) {
    const folder = trimPath(row.cwd ?? '')
    byFolder.set(folder, [...(byFolder.get(folder) ?? []), row])
  }

  return byFolder
}

/** Every live session placed in a project; named projects always appear, automatic ones only with sessions. */
export function buildProjectTree(
  projects: readonly ProjectEntry[],
  sessions: readonly SessionInfo[],
  previewLimit = 3
): ProjectNode[] {
  const live = sessions.filter(row => !row.archived)
  const placed = new Map<string, SessionInfo[]>()
  const homeless: SessionInfo[] = []
  const strays = new Map<string, SessionInfo[]>()

  for (const row of live) {
    const cwd = (row.cwd ?? '').trim()
    const owner = cwd ? ownerOf(cwd, projects) : null

    if (owner) {
      placed.set(owner.id, [...(placed.get(owner.id) ?? []), row])
    } else if (cwd) {
      strays.set(trimPath(cwd), [...(strays.get(trimPath(cwd)) ?? []), row])
    } else {
      homeless.push(row)
    }
  }

  const named = projects.map(project =>
    node(
      { id: project.id, label: project.name, path: project.path },
      [...groupByFolder(placed.get(project.id) ?? [])].map(([folder, rows]) => laneFor(project.path, folder, rows)),
      project.derived ? { isAuto: true } : {},
      previewLimit
    )
  )

  const auto = [...strays].map(([folder, rows]) =>
    node({ id: folder, label: leaf(folder), path: folder }, [laneFor(folder, folder, rows)], { isAuto: true }, previewLimit)
  )

  const home = homeless.length
    ? [
        node(
          { id: NO_PROJECT_ID, label: 'Home', path: null },
          [{ id: NO_PROJECT_ID, isGit: false, isMain: true, label: 'Home', path: null, sessions: homeless.sort(newestFirst) }],
          { isAuto: true, isNoProject: true },
          previewLimit
        )
      ]
    : []

  return [...named, ...auto, ...home].filter(project => project.sessionCount > 0 || !project.isAuto)
}
