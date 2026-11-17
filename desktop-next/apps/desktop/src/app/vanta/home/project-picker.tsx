import { IconChevronDown } from '@tabler/icons-react'

import { Chip } from '@/components/ui/chip'
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
  disabled?: boolean
  onChange: (id: string) => void
  projectId: string | null
  projects: ProjectChip[]
}

/** The "Vanta project" chip: shows the selected project and opens a radio list of the others. */
export function ProjectPicker({ disabled, onChange, projectId, projects }: ProjectPickerProps) {
  const selected = projects.find(project => project.id === projectId) ?? (projectId ? undefined : projects[0])
  const name = selected?.name ?? 'Saved project'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Chip aria-label={`${HOME_COPY.projectLabel}: ${name}`} data-testid="home-composer-project" data-vp="chip-project" disabled={disabled}>
          {name + HOME_COPY.projectSuffix}
          <IconChevronDown aria-hidden size={12} stroke={2} />
        </Chip>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup onValueChange={onChange} value={selected?.id ?? projectId ?? ''}>
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
