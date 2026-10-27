import type { ReactNode } from 'react'

/** Props contracts for the Vanta page surfaces. Pure data in, intents out:
 *  nothing here knows about the gateway, stores or Electron, so every screen
 *  renders from fixtures and is wired to live data in a later slice. */

/** One independently-loading block (Home sections, list pages, workbench tabs). */
export type BlockState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: T[] }

// ── Home ────────────────────────────────────────────────────────────────

export interface ProjectChip {
  id: string
  name: string
}

export interface NeedsYouItem {
  id: string
  title: string
  detail: string
  /** True when the pending action is a single approval that Allow once can grant. */
  canAllowOnce: boolean
}

export interface RunningItem {
  id: string
  title: string
  detail: string
}

export interface NextUpItem {
  id: string
  title: string
  detail: string
  /** `run` shows "Run now", `edit` shows "Edit". */
  action: 'edit' | 'run'
}

export interface RecentOutputItem {
  id: string
  name: string
}

export type HomeBlock = 'nextUp' | 'needsYou' | 'recent' | 'running'

export interface HomeActions {
  onAttachTask: (text: string, projectId: string | null) => void
  onAllowOnce: (id: string) => void
  onEditSchedule: (id: string) => void
  onOpenOutput: (id: string) => void
  onOpenSession: (id: string) => void
  onRetry: (block: HomeBlock) => void
  onRevealOutput: (id: string) => void
  onRunSchedule: (id: string) => void
  onStopRun: (id: string) => void
  onSubmitTask: (text: string, projectId: string | null) => void
}

export interface HomeDraftControl {
  available?: boolean
  pending?: boolean
  blocked?: boolean
  attention?: string
  initial: { text: string; projectId: string | null }
  change: (value: { text: string; projectId: string | null }) => void
}

export interface HomeProps {
  draft?: HomeDraftControl
  actions: HomeActions
  needsYou: BlockState<NeedsYouItem>
  nextUp: BlockState<NextUpItem>
  projects: ProjectChip[]
  recent: BlockState<RecentOutputItem>
  running: BlockState<RunningItem>
  /** Starter prompt offered when every block is empty. */
  starterPrompt?: string
}

// ── List pages (Schedules, Connections, Skills & tools, Outputs) ──────────

export type ListIconKind = 'attention' | 'connection' | 'file' | 'running' | 'schedule' | 'skill'

export interface ListRowItem {
  id: string
  icon: ListIconKind
  title: string
  detail: string
  actionLabel: string
}

export interface ListPageProps {
  /** Called with the row id when its row action is pressed. */
  onRowAction: (id: string) => void
  onPrimary: () => void
  onRetry: () => void
  rows: BlockState<ListRowItem>
}

// ── Workbench ───────────────────────────────────────────────────────────

export const WORKBENCH_TABS = ['changes', 'files', 'browser', 'terminal', 'outputs'] as const
export type WorkbenchTab = (typeof WORKBENCH_TABS)[number]
export type WorkbenchMode = 'docked' | 'overlay' | 'sheet'

export type TabState<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T }

export interface ChangedFile {
  path: string
  added: number
  removed: number
  /** Unified-diff-style lines shown under the row; omitted when not expanded. */
  diff?: string
}

export interface ChangesData {
  files: ChangedFile[]
}

export interface FileNode {
  name: string
  /** Absent for files; present (possibly empty) for folders. */
  children?: FileNode[]
}

export interface FilesData {
  roots: FileNode[]
  /** Text for the preview pane of the selected file. */
  preview?: { path: string; text: string }
}

export interface BrowserData {
  url: string
}

export interface TerminalData {
  output: string
}

export interface OutputEntry {
  id: string
  name: string
}

export interface OutputsData {
  items: OutputEntry[]
}

export interface WorkbenchProps {
  browser: TabState<BrowserData>
  changes: TabState<ChangesData>
  files: TabState<FilesData>
  mode: WorkbenchMode
  onClose: () => void
  onOpenOutput: (id: string) => void
  onRestore: () => void
  onRetry: (tab: WorkbenchTab) => void
  onSelectFile: (path: string) => void
  onTabChange: (tab: WorkbenchTab) => void
  outputs: TabState<OutputsData>
  tab: WorkbenchTab
  terminal: TabState<TerminalData>
  /** Hosts for the live surfaces (webview, xterm); a placeholder shows when absent. */
  slots?: { browserPreview?: ReactNode; terminalLive?: ReactNode }
}

// ── Command palette ─────────────────────────────────────────────────────

export type PaletteGroup = 'action' | 'chat' | 'go'

export interface PaletteCommand {
  id: string
  label: string
  group: PaletteGroup
  /** Right-aligned shortcut hint, e.g. "⌘N". */
  hint?: string
}

export interface PaletteProps {
  commands: PaletteCommand[]
  onClose: () => void
  onRun: (id: string) => void
}

// ── Settings ────────────────────────────────────────────────────────────

export const SETTINGS_SECTIONS = ['general', 'models', 'permissions', 'voice', 'appearance'] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

export interface SettingOption {
  value: string
  label: string
}

/** A row whose value is picked from a short list and saved the moment it changes. */
export interface SettingChoice {
  id: string
  label: string
  options: SettingOption[]
  value: string
}

export interface RememberedApproval {
  id: string
  /** What Always covers, e.g. "Shell commands". */
  scope: string
}

export interface ProjectApprovals {
  approvals: RememberedApproval[]
  projectId: string
  projectName: string
}

export interface SettingsProps {
  approvals: ProjectApprovals[]
  onClose: () => void
  onRevoke: (approvalId: string) => Promise<void>
  onSave: (id: string, value: string) => Promise<void>
  onSectionChange: (section: SettingsSection) => void
  rows: Record<SettingsSection, SettingChoice[]>
  section: SettingsSection
}
