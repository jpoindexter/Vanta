import { useStore } from '@nanostores/react'
import { IconChevronDown } from '@tabler/icons-react'
import type { FC } from 'react'

import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  $permissionMode,
  PERMISSION_MODES,
  type PermissionMode,
  permissionModeLabel,
  setPermissionMode
} from '@/store/permission-mode'

/** The permission mode as a visible chip: what Vanta may do without asking, one click to change. */
export const PermissionChip: FC<{ disabled?: boolean }> = ({ disabled }) => {
  const mode = useStore($permissionMode)
  const label = permissionModeLabel(mode)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Permission mode: ${label}`}
          className="vp-chip shrink-0"
          data-vp="chip-permission"
          disabled={disabled}
          type="button"
        >
          <span>{label}</span>
          <IconChevronDown aria-hidden className="size-2.5 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72" side="top" sideOffset={8}>
        <DropdownMenuRadioGroup onValueChange={value => setPermissionMode(value as PermissionMode)} value={mode}>
          {PERMISSION_MODES.map(option => (
            <DropdownMenuRadioItem key={option.id} value={option.id}>
              <span className="flex flex-col">
                <span>{option.label}</span>
                <span className="text-(--ui-text-tertiary) text-xs">{option.hint}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
