import {
  IconArrowsExchange,
  IconCalendarClock,
  IconFiles,
  IconHome,
  IconSparkles,
  IconUsersGroup,
  type TablerIcon
} from '@tabler/icons-react'

import { ARTIFACTS_ROUTE, CAPABILITIES_ROUTE, COMPANY_ROUTE, CRON_ROUTE, MESSAGING_ROUTE, NEW_CHAT_ROUTE } from '@/app/routes'
import type { VantaShellTranslations } from '@/i18n/types_vanta_shell'

export type DestinationLabelKey = keyof VantaShellTranslations['sidebar']['nav']

/** A noun the user can go to. Actions (New chat, Search) are not destinations. */
export interface ShellDestination {
  id: string
  labelKey: DestinationLabelKey
  icon: TablerIcon
  route: string
  /** Keybind action that opens it; its combo shows as the row hint. */
  actionId?: string
}

const BUILT_IN: readonly ShellDestination[] = [
  { id: 'home', labelKey: 'home', icon: IconHome, route: NEW_CHAT_ROUTE, actionId: 'nav.home' },
  { id: 'schedules', labelKey: 'schedules', icon: IconCalendarClock, route: CRON_ROUTE, actionId: 'nav.cron' },
  {
    id: 'connections',
    labelKey: 'connections',
    icon: IconArrowsExchange,
    route: MESSAGING_ROUTE,
    actionId: 'nav.messaging'
  },
  { id: 'skills', labelKey: 'skills', icon: IconSparkles, route: CAPABILITIES_ROUTE, actionId: 'nav.capabilities' },
  { id: 'outputs', labelKey: 'outputs', icon: IconFiles, route: ARTIFACTS_ROUTE, actionId: 'nav.artifacts' }
]

const COMPANY: ShellDestination = { id: 'company', labelKey: 'company', icon: IconUsersGroup, route: COMPANY_ROUTE }

export interface DestinationOptions {
  /** Replaces the built-in Company entry (after Outputs). */
  company?: ShellDestination
}

export function shellDestinations({ company }: DestinationOptions = {}): readonly ShellDestination[] {
  return [...BUILT_IN, company ?? COMPANY]
}
