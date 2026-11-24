import { IconSettings } from '@tabler/icons-react'
import { useStore } from '@nanostores/react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/i18n'
import { displayModelName } from '@/lib/model-status-label'
import { $currentModel, $connection, $gatewayState } from '@/store/session'
import { $statusbarVisible, toggleStatusbarVisible } from '@/store/statusbar-prefs'
import { $activeGatewayProfile } from '@/store/profile'
import { $desktopVersion } from '@/store/updates'

interface SidebarFooterProps {
  onOpenSettings: () => void
}

const profileInitial = (name: string): string => name.trim().charAt(0).toUpperCase() || '?'

function useFooterState() {
  const { t } = useI18n()
  const copy = t.vantaShell.sidebar.footer
  const profile = useStore($activeGatewayProfile)
  const model = useStore($currentModel)
  const gateway = useStore($gatewayState)
  const connection = useStore($connection)
  const version = useStore($desktopVersion)?.appVersion
  const name = profile === 'default' ? copy.profileDefault : profile
  const kind = connection?.mode === 'remote' ? copy.remoteBackend : copy.localBackend
  const modelName = model ? displayModelName(model) : copy.noModel

  const link =
    gateway === 'open' ? copy.connected : gateway === 'connecting' ? copy.connecting : t.vantaShell.status.offline

  return { copy, kind, link, modelName, name, version }
}

/** Profile and settings, with the status that used to live in the bottom bar
 *  (version, backend, model) behind the profile button. */
export function SidebarFooter({ onOpenSettings }: SidebarFooterProps) {
  const { copy, kind, link, modelName, name, version } = useFooterState()
  const statusbar = useStore($statusbarVisible)

  return (
    <div className="vs-footer">
      <Popover>
        <PopoverTrigger asChild>
          <button aria-label={copy.account} className="vs-footer-id" type="button">
            <span aria-hidden className="vs-icon vs-chip-avatar">
              {profileInitial(name)}
            </span>
            <span className="vs-footer-text">
              <span>{name}</span>
              <span className="vs-footer-sub">
                {kind} · {modelName}
              </span>
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" side="top">
          <div className="vs-popover">
            <dl>
              <dt>{copy.versionLabel}</dt>
              <dd>{version ?? '-'}</dd>
              <dt>{copy.backend}</dt>
              <dd>
                {kind} · {link}
              </dd>
              <dt>{copy.model}</dt>
              <dd>{modelName}</dd>
            </dl>
            <label className="vs-popover-toggle">
              <span>{copy.statusbar}</span>
              <Switch aria-label={copy.statusbar} checked={statusbar} onCheckedChange={toggleStatusbarVisible} />
            </label>
          </div>
        </PopoverContent>
      </Popover>
      <button
        aria-label={copy.settings}
        className="vs-icon"
        data-testid="sidebar-settings"
        onClick={onOpenSettings}
        type="button"
      >
        <IconSettings aria-hidden size={16} />
      </button>
    </div>
  )
}
