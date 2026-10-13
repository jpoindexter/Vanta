import { IconPlus, IconSearch } from '@tabler/icons-react'

import { useI18n } from '@/i18n'
import { useKeybindHint } from '@/lib/keybinds/use-keybind-hint'

import { shellDestinations, type ShellDestination } from './destinations'

interface NavActionProps {
  hintAction: string
  icon: typeof IconPlus
  label: string
  onSelect: () => void
}

function NavAction({ hintAction, icon: Icon, label, onSelect }: NavActionProps) {
  const hint = useKeybindHint(hintAction)

  return (
    <button aria-label={label} className="vs-nav" onClick={onSelect} type="button">
      <span aria-hidden className="vs-nav-glyph">
        <Icon size={18} />
      </span>
      <span className="vs-nav-text">{label}</span>
      {hint ? <span className="vs-nav-key">{hint}</span> : null}
    </button>
  )
}

interface DestinationRowProps {
  active: boolean
  destination: ShellDestination
  onOpen: (destination: ShellDestination) => void
}

function DestinationRow({ active, destination, onOpen }: DestinationRowProps) {
  const { t } = useI18n()
  const label = t.vantaShell.sidebar.nav[destination.labelKey]
  const Icon = destination.icon

  return (
    <button
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      className="vs-nav"
      onClick={() => onOpen(destination)}
      type="button"
    >
      <span aria-hidden className="vs-nav-glyph">
        <Icon size={18} />
      </span>
      <span className="vs-nav-text">{label}</span>
    </button>
  )
}

interface SidebarNavProps {
  /** The destination whose page is showing, or null while a chat is. */
  activeId: null | string
  company?: ShellDestination
  onNewChat: () => void
  onOpen: (destination: ShellDestination) => void
  onSearch: () => void
}

/** New chat and Search (actions), then the destinations (nouns). */
export function SidebarNav({ activeId, company, onNewChat, onOpen, onSearch }: SidebarNavProps) {
  const { t } = useI18n()
  const copy = t.vantaShell.sidebar

  return (
    <nav aria-label={copy.label}>
      <NavAction hintAction="session.new" icon={IconPlus} label={copy.newChat} onSelect={onNewChat} />
      <NavAction hintAction="nav.commandPalette" icon={IconSearch} label={copy.search} onSelect={onSearch} />
      <div>
        {shellDestinations({ company }).map(destination => (
          <DestinationRow active={activeId === destination.id} destination={destination} key={destination.id} onOpen={onOpen} />
        ))}
      </div>
    </nav>
  )
}
