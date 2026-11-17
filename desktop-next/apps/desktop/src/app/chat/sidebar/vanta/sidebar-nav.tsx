import { IconPlus, IconSearch } from '@tabler/icons-react'

import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { useKeybindHint } from '@/lib/keybinds/use-keybind-hint'

import { shellDestinations, type ShellDestination } from './destinations'

interface NavActionProps {
  hintAction: string
  icon: typeof IconPlus
  label: string
  navId: string
  onSelect: () => void
}

function NavAction({ hintAction, icon: Icon, label, navId, onSelect }: NavActionProps) {
  const hint = useKeybindHint(hintAction)

  return (
    <Tip boundary="viewport" label={label} placement="left-rail">
      <button aria-label={label} className="vs-nav" data-testid={`nav-${navId}`} onClick={onSelect} type="button">
        <span aria-hidden className="vs-nav-glyph">
          <Icon size={18} />
        </span>
        <span className="vs-nav-text" data-tour={`sidebar-nav-${navId}`}>
          {label}
        </span>
        {hint ? <span className="vs-nav-key">{hint}</span> : null}
      </button>
    </Tip>
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
    <Tip boundary="viewport" label={label} placement="left-rail">
      <button
        aria-current={active ? 'page' : undefined}
        aria-label={label}
        className="vs-nav"
        data-testid={`nav-${destination.navId}`}
        onClick={() => onOpen(destination)}
        type="button"
      >
        <span aria-hidden className="vs-nav-glyph">
          <Icon size={18} />
        </span>
        <span className="vs-nav-text" data-tour={`sidebar-nav-${destination.navId}`}>
          {label}
        </span>
      </button>
    </Tip>
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
      <NavAction hintAction="session.new" icon={IconPlus} label={copy.newChat} navId="new-session" onSelect={onNewChat} />
      <NavAction hintAction="nav.commandPalette" icon={IconSearch} label={copy.search} navId="search" onSelect={onSearch} />
      <div>
        {shellDestinations({ company }).map(destination => (
          <DestinationRow active={activeId === destination.id} destination={destination} key={destination.id} onOpen={onOpen} />
        ))}
      </div>
    </nav>
  )
}
