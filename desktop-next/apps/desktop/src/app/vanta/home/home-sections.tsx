import { BLOCK_ERROR, HOME_COPY } from '../copy'
import type { HomeActions, HomeProps } from '../types'
import { Block } from '../ui/block'
import { VpButton } from '../ui/button'
import { VpRow, VpSimpleRow } from '../ui/row'

type SectionProps = Pick<HomeProps, 'needsYou' | 'nextUp' | 'recent' | 'running'> & { actions: HomeActions }

function Empty({ children, testId }: { children: string; testId?: string }) {
  return (
    <p className="vp-empty-line" data-testid={testId}>
      {children}
    </p>
  )
}

function NeedsYouSection({ actions, needsYou }: Pick<SectionProps, 'actions' | 'needsYou'>) {
  const count = needsYou.status === 'ready' ? needsYou.items.length : null

  return (
    <section aria-labelledby="vp-home-needs" className="vp-sec" data-testid="home-section">
      <div className="vp-sechead">
        <h3 data-testid="home-section-title" id="vp-home-needs">
          {HOME_COPY.needsYou} {count !== null && <span className="vp-badge" data-testid="home-needs-badge">{count}</span>}
        </h3>
      </div>
      <Block
        empty={<Empty testId="home-empty">{HOME_COPY.needsYouEmpty}</Empty>}
        errorLabel={BLOCK_ERROR.needsYou}
        onRetry={() => actions.onRetry('needsYou')}
        state={needsYou}
      >
        {items =>
          items.map(item => (
            <VpRow
              actions={
                <>
                  {item.canAllowOnce && (
                    <VpButton
                      aria-label={`${HOME_COPY.allowOnce}: ${item.title}`}
                      onClick={() => actions.onAllowOnce(item.id)}
                      variant="primary"
                    >
                      {HOME_COPY.allowOnce}
                    </VpButton>
                  )}
                  <VpButton aria-label={`${HOME_COPY.open} ${item.title}`} onClick={() => actions.onOpenSession(item.id)}>
                    {HOME_COPY.open}
                  </VpButton>
                </>
              }
              detail={item.detail}
              icon="attention"
              key={item.id}
              title={item.title}
            />
          ))
        }
      </Block>
    </section>
  )
}

function RunningSection({ actions, running }: Pick<SectionProps, 'actions' | 'running'>) {
  return (
    <section aria-labelledby="vp-home-running" className="vp-sec" data-testid="home-section">
      <h3 data-testid="home-section-title" id="vp-home-running">{HOME_COPY.running}</h3>
      <Block
        empty={<Empty>{HOME_COPY.runningEmpty}</Empty>}
        errorLabel={BLOCK_ERROR.running}
        onRetry={() => actions.onRetry('running')}
        state={running}
      >
        {items =>
          items.map(item => (
            <VpRow
              actions={
                <>
                  <VpButton aria-label={`${HOME_COPY.open} ${item.title}`} onClick={() => actions.onOpenSession(item.id)}>
                    {HOME_COPY.open}
                  </VpButton>
                  <VpButton aria-label={`${HOME_COPY.stop} ${item.title}`} onClick={() => actions.onStopRun(item.id)}>
                    {HOME_COPY.stop}
                  </VpButton>
                </>
              }
              detail={item.detail}
              icon="running"
              key={item.id}
              title={item.title}
            />
          ))
        }
      </Block>
    </section>
  )
}

function NextUpSection({ actions, nextUp }: Pick<SectionProps, 'actions' | 'nextUp'>) {
  return (
    <section aria-labelledby="vp-home-next" className="vp-sec" data-testid="home-section">
      <h3 data-testid="home-section-title" id="vp-home-next">{HOME_COPY.nextUp}</h3>
      <Block
        empty={<Empty>{HOME_COPY.nextUpEmpty}</Empty>}
        errorLabel={BLOCK_ERROR.nextUp}
        onRetry={() => actions.onRetry('nextUp')}
        state={nextUp}
      >
        {items =>
          items.map(item => {
            const label = item.action === 'run' ? HOME_COPY.runNow : HOME_COPY.edit
            const handler = item.action === 'run' ? actions.onRunSchedule : actions.onEditSchedule

            return (
              <VpRow
                actions={
                  <VpButton aria-label={`${label}: ${item.title}`} onClick={() => handler(item.id)}>
                    {label}
                  </VpButton>
                }
                detail={item.detail}
                icon="schedule"
                key={item.id}
                title={item.title}
              />
            )
          })
        }
      </Block>
    </section>
  )
}

function RecentSection({ actions, recent }: Pick<SectionProps, 'actions' | 'recent'>) {
  return (
    <section aria-labelledby="vp-home-recent" className="vp-sec" data-testid="home-section">
      <h3 data-testid="home-section-title" id="vp-home-recent">{HOME_COPY.recent}</h3>
      <Block
        empty={<Empty>{HOME_COPY.recentEmpty}</Empty>}
        errorLabel={BLOCK_ERROR.recent}
        onRetry={() => actions.onRetry('recent')}
        state={recent}
      >
        {items =>
          items.map(item => (
            <VpSimpleRow
              actions={
                <>
                  <VpButton aria-label={`${HOME_COPY.open} ${item.name}`} onClick={() => actions.onOpenOutput(item.id)}>
                    {HOME_COPY.open}
                  </VpButton>
                  <VpButton aria-label={`${HOME_COPY.reveal} ${item.name}`} onClick={() => actions.onRevealOutput(item.id)}>
                    {HOME_COPY.reveal}
                  </VpButton>
                </>
              }
              icon="file"
              key={item.id}
              title={item.name}
            />
          ))
        }
      </Block>
    </section>
  )
}

/** The four supervision blocks, in the wireframe's reading order. */
export function HomeSections(props: SectionProps) {
  return (
    <>
      <NeedsYouSection actions={props.actions} needsYou={props.needsYou} />
      <RunningSection actions={props.actions} running={props.running} />
      <NextUpSection actions={props.actions} nextUp={props.nextUp} />
      <RecentSection actions={props.actions} recent={props.recent} />
    </>
  )
}
