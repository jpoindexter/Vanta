import type { ListPageProps } from '../types'
import { ListPage } from './list-page'

export function SchedulesPage(props: ListPageProps) {
  return <ListPage page="schedules" {...props} />
}

export function ConnectionsPage(props: ListPageProps) {
  return <ListPage page="connections" {...props} />
}

export function SkillsPage(props: ListPageProps) {
  return <ListPage page="skills" {...props} />
}

export function OutputsPage(props: ListPageProps) {
  return <ListPage page="outputs" {...props} />
}
