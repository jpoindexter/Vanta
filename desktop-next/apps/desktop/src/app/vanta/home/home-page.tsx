import { useState } from 'react'

import { HOME_COPY } from '../copy'
import type { BlockState, HomeProps } from '../types'
import { VpChip } from '../ui/button'

import { HomeComposer } from './home-composer'
import { HomeSections } from './home-sections'
import { TodaySection } from './today-section'

function isEmptyReady(state: BlockState<unknown>): boolean {
  return state.status === 'ready' && state.items.length === 0
}

/** Home: start a task, then supervise (Needs you, Running now, Next up, Recent outputs). */
export function HomePage({ actions, needsYou, nextUp, projects, recent, running, starterPrompt }: HomeProps) {
  const [value, setValue] = useState('')
  const [projectId, setProjectId] = useState<string | null>(projects[0]?.id ?? null)
  const allEmpty = [needsYou, running, nextUp, recent].every(isEmptyReady)

  const submit = () => {
    const text = value.trim()

    if (text) {
      actions.onSubmitTask(text, projectId)
      setValue('')
    }
  }

  return (
    <div aria-label="Home" className="vp vp-page" data-testid="page" role="region">
      <div className="vp-col" data-testid="page-column">
        <h2 className="sr-only">Home</h2>
        <HomeComposer
          onProjectChange={setProjectId}
          onSubmit={submit}
          onValueChange={setValue}
          projectId={projectId}
          projects={projects}
          value={value}
        />
        <div aria-label={HOME_COPY.projectLabel} className="vp-chips" role="group">
          {projects.map(project => (
            <VpChip aria-pressed={project.id === projectId} data-testid="home-project-chip" key={project.id} onClick={() => setProjectId(project.id)}>
              {project.name}
            </VpChip>
          ))}
        </div>
        <TodaySection />
        <HomeSections actions={actions} needsYou={needsYou} nextUp={nextUp} recent={recent} running={running} />
        {allEmpty && starterPrompt && (
          <div className="vp-chips">
            <VpChip onClick={() => setValue(starterPrompt)}>{starterPrompt}</VpChip>
          </div>
        )}
      </div>
    </div>
  )
}
