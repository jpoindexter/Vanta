export const CHAT_STATES = ['empty', 'running', 'waiting', 'blocked', 'done', 'failed', 'offline'] as const

export type ChatFixtureState = (typeof CHAT_STATES)[number]

export interface FixtureParams {
  state: ChatFixtureState
  theme: 'dark' | 'light'
  /** Window width of the wireframe frame this scene stands in for. */
  width: number
  /** Extra scenario flags, e.g. `long`, `queue`, `attachments`, `draft10`, `oneway`. */
  flags: ReadonlySet<string>
}

/** The wireframe's main column: window width minus the sidebar (275 / 56 / none). */
export const MAIN_WIDTH: Record<number, number> = { 1440: 1165, 1100: 1044, 800: 800 }

/** Frame height 660 minus the 44px titlebar. */
export const MAIN_HEIGHT = 616

export function parseFixtureParams(search: string): FixtureParams {
  const query = new URLSearchParams(search)
  const state = query.get('state') as ChatFixtureState | null
  const width = Number(query.get('w') ?? 1440)

  return {
    state: state && CHAT_STATES.includes(state) ? state : 'waiting',
    theme: query.get('theme') === 'dark' ? 'dark' : 'light',
    width: width in MAIN_WIDTH ? width : 1440,
    flags: new Set((query.get('flags') ?? '').split(',').filter(Boolean))
  }
}
