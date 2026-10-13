import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useI18n } from '@/i18n'

import { copyProjectPath, revealProjectFolder, switchProjectFolder } from './project-actions'

interface ProjectChipProps {
  /** The folder the chat runs in. */
  path: string
  /** Its last segment, the chip's label. */
  project: string
}

/** The project chip in the titlebar: its menu switches project, reveals the folder in Finder and copies its path. */
export function ProjectChip({ path, project }: ProjectChipProps) {
  const { t } = useI18n()
  const copy = t.vantaShell.titlebar

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={copy.projectMenu(project)}
          className="vs-chip"
          data-testid="titlebar-project-chip"
          title={path}
          type="button"
        >
          {project}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" data-testid="project-chip-menu">
        <DropdownMenuItem data-testid="project-switch" onSelect={() => void switchProjectFolder(path, copy)}>
          {copy.switchProject}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem data-testid="project-reveal" onSelect={() => void revealProjectFolder(path)}>
          {copy.revealProject}
        </DropdownMenuItem>
        <DropdownMenuItem data-testid="project-copy-path" onSelect={() => void copyProjectPath(path, copy)}>
          {copy.copyProjectPath}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
