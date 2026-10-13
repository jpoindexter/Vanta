import { IconChevronDown } from '@tabler/icons-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

import { HOME_COPY } from '../copy'
import type { ProjectChip } from '../types'

interface ProjectPickerProps {
  onChange: (id: string) => void
  projectId: string | null
  projects: ProjectChip[]
}

/** The "Vanta project" chip: shows the selected project and opens a radio list of the others. */
export function ProjectPicker({ onChange, projectId, projects }: ProjectPickerProps) {
  const selected = projects.find(project => project.id === projectId) ?? projects[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`${HOME_COPY.projectLabel}: ${selected.name}`}
          className="vp-chip vp-chip--menu"
          data-testid="home-composer-project"
          type="button"
        >
          {selected.name + HOME_COPY.projectSuffix}
          <IconChevronDown aria-hidden size={12} stroke={2} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup onValueChange={onChange} value={selected.id}>
          {projects.map(project => (
            <DropdownMenuRadioItem key={project.id} value={project.id}>
              {project.name + HOME_COPY.projectSuffix}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
