import { Chip } from '@/components/ui/chip'
import { useStore } from '@nanostores/react'
import { IconChevronDown } from '@tabler/icons-react'
import type { FC } from 'react'

import { useSessionView } from '@/app/chat/session-view'
import { useGatewayRequest } from '@/app/gateway/hooks/use-gateway-request'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { PERMISSION_MODES, type PermissionMode, type PermissionRequester } from '@/store/permission-mode'

import { FullAccessDialog } from './full-access-dialog'
import { usePermissionChoice } from './use-permission-choice'

interface ViewProps {
  disabled?: boolean
  request: PermissionRequester
  sessionId: null | string
}

/** The permission mode as a visible chip: what Vanta may do without asking, one click to change. */
export const PermissionChipView: FC<ViewProps> = ({ disabled, request, sessionId }) => {
  const choice = usePermissionChoice(request, sessionId)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Chip
            aria-label={`Permission mode: ${choice.label}`}
            className="shrink-0"
            data-vp="chip-permission"
            disabled={disabled}
            type="button"
          >
            <span>{choice.label}</span>
            <IconChevronDown aria-hidden className="size-2.5 shrink-0 opacity-50" />
          </Chip>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72" side="top" sideOffset={8}>
          <DropdownMenuRadioGroup
            onValueChange={value => choice.choose(value as PermissionMode)}
            value={choice.known ? choice.mode : ''}
          >
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
      <FullAccessDialog
        onCancel={choice.cancelFull}
        onConfirm={choice.confirmFull}
        open={choice.confirmingFull}
        root={choice.root}
      />
    </>
  )
}

export const PermissionChip: FC<{ disabled?: boolean }> = ({ disabled }) => {
  const { requestGateway } = useGatewayRequest()
  const sessionId = useStore(useSessionView().$runtimeId)

  return <PermissionChipView disabled={disabled} request={requestGateway} sessionId={sessionId} />
}
