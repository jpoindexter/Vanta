import { IconPlus, IconSettings } from '@tabler/icons-react'

import { SETTINGS_ROUTE } from '@/app/routes'
import type { SidebarNavItem } from '@/app/types'

/** The controller's `onNavigate` takes nav items; these are the two non-destination
 *  ones the shell raises (New chat is an action, Settings an overlay route). */
export const newChatNavItem = (label: string): SidebarNavItem => ({
  action: 'new-session',
  icon: IconPlus,
  id: 'new-session',
  label
})

export const settingsNavItem = (label: string): SidebarNavItem => ({
  icon: IconSettings,
  id: 'settings',
  label,
  route: SETTINGS_ROUTE
})
