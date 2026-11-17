import type { Dispatch, SetStateAction } from 'react'

import type { VantaGateway } from '@/desktop-api'
import type { IconComponent } from '@/lib/icons'
import type { EnvVarInfo } from '@/types/desktop'

export type SettingsView =
  | 'about'
  | 'billing'
  | 'connections'
  | 'gateway'
  | 'keybinds'
  | 'keys'
  | 'notifications'
  | 'plugins'
  | 'providers'
  | 'reset'
  | 'sessions'
  | 'vault'
  | `config:${string}`
export type EnvPatch = Partial<Pick<EnvVarInfo, 'is_set' | 'redacted_value'>>

export interface SettingsPageProps {
  gateway?: VantaGateway | null
  onClose: () => void
  onConfigSaved?: () => void
  onMainModelChanged?: (provider: string, model: string) => void
}

export interface ProviderGroup {
  name: string
  priority: number
  entries: [string, EnvVarInfo][]
  hasAnySet: boolean
}

export interface DesktopConfigSection {
  id: string
  label: string
  icon: IconComponent
  keys: string[]
}

export interface EnvRowProps {
  varKey: string
  info: EnvVarInfo
  edits: Record<string, string>
  revealed: Record<string, string>
  saving: string | null
  setEdits: Dispatch<SetStateAction<Record<string, string>>>
  onSave: (key: string, editKey?: string) => void
  onClear: (key: string, editKey?: string) => void
  onReveal: (key: string) => void
  compact?: boolean
}
