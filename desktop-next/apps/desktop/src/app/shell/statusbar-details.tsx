import { IconDots } from '@tabler/icons-react'
import type { ReactNode } from 'react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useI18n } from '@/i18n'

/** Reuses the actual status controls, including their menus and profile-scoped actions. */
export function StatusbarDetails({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const label = t.notifications.details

  return <Popover>
    <PopoverTrigger asChild>
      <button className="vs-status-details-trigger" data-testid="statusbar-details" type="button">
        <IconDots aria-hidden size={16} />{label}
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" aria-label={label} className="vs-status-details" data-testid="statusbar-details-panel" side="top">
      {children}
    </PopoverContent>
  </Popover>
}
