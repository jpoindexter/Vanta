import { HOME_COPY } from '../copy'
import type { BlockState, HomeProps } from '../types'
import { VpChip } from '../ui/button'

import { HomeComposer } from './home-composer'
import { HomeSections } from './home-sections'
import { TodaySection } from './today-section'
import { useHomeComposerDraft } from './use-home-composer-draft'

function isEmptyReady(state: BlockState<unknown>): boolean {
  return state.status === 'ready' && state.items.length === 0
}

/** Home: start a task, then supervise (Needs you, Running now, Next up, Recent outputs). */
export function HomePage({ actions, draft, needsYou, nextUp, projects, recent, running, starterPrompt }: HomeProps) {
  const { value, projectId, change, clear } = useHomeComposerDraft(draft)
  const selectedProjectId = projectId ?? projects[0]?.id ?? null
  const allEmpty = [needsYou, running, nextUp, recent].every(isEmptyReady)

  const submit = () => {
    const text = value.trim()

    if (text) {
      actions.onSubmitTask(text, selectedProjectId)
      clear()
    }
  }

  return (
    <div aria-label="Home" className="vp vp-page" data-testid="page" role="region">
      <div className="vp-col" data-testid="page-column">
        <h2 className="sr-only">Home</h2>
        <HomeComposer
          disabled={draft?.available === false}
          pending={draft?.pending}
          blocked={draft?.blocked}
          attention={draft?.attention}
          onAttach={() => actions.onAttachTask(value, selectedProjectId)}
          onProjectChange={id => change(value, id)}
          onSubmit={submit}
          onValueChange={text => change(text, selectedProjectId)}
          projectId={selectedProjectId}
          projects={projects}
          value={value}
        />
        <div aria-label={HOME_COPY.projectLabel} className="vp-chips" role="group">
          {projects.map(project => (
            <VpChip aria-pressed={project.id === selectedProjectId} data-testid="home-project-chip" disabled={draft?.available === false || draft?.pending} key={project.id} onClick={() => change(value, project.id)}>
              {project.name}
            </VpChip>
          ))}
        </div>
        <TodaySection />
        <HomeSections actions={actions} needsYou={needsYou} nextUp={nextUp} recent={recent} running={running} />
        {allEmpty && starterPrompt && (
          <div className="vp-chips">
            <VpChip disabled={draft?.available === false} onClick={() => change(starterPrompt, selectedProjectId)}>{starterPrompt}</VpChip>
          </div>
        )}
      </div>
    </div>
  )
}
