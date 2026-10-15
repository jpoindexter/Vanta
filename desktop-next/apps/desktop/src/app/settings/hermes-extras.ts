// The Model settings sub-pages Vanta does not serve: Auxiliary models lists helper
// tasks Vanta has no slot for (the server refuses every change), and Mixture of
// Agents has no Vanta backend. They stay in the tree behind this one switch so
// bringing them back is a one-line change.
export const SHOW_HERMES_MODEL_EXTRAS = false

const HIDDEN_MODEL_SUBPAGES: ReadonlySet<string> = new Set(['auxiliary', 'moa'])

export function isHiddenModelSubpage(id: string | undefined): boolean {
  return !SHOW_HERMES_MODEL_EXTRAS && id !== undefined && HIDDEN_MODEL_SUBPAGES.has(id)
}

// The Telegram "scan a QR code" setup creates the bot through Hermes' pairing service, which
// Vanta does not run (the call has no server route). Pasting a BotFather token works today.
export const SHOW_TELEGRAM_QR_SETUP = false

// Webhook subscriptions need a receiver Vanta's desktop server does not run yet, so the page can only
// show an error. The status-bar entry stays out until it has a backend.
export const SHOW_WEBHOOKS = false

// The Kanban board is a bundled Hermes plugin that reads `/api/plugins/kanban/*` from a Hermes backend.
// Vanta's task board is Company › Tickets, so the plugin is neither listed nor loaded.
export const SHOW_KANBAN = false

// Passwords & Logins is Hermes' credential vault (`vault.*` RPCs). Vanta keeps secrets in the OS keychain and asks
// for approval before it uses one, so the page has no backend and can only show a load error.
export const SHOW_VAULT = false

// Context & compression holds Hermes' prompt-compression knobs (`context.*`, `compression.*`). Vanta's server has none
// of those keys, so the page renders empty. The Memory page keeps its Persistent sub-page.
export const SHOW_CONTEXT_SETTINGS = false

export const isHiddenMemorySubpage = (id: string | undefined): boolean => !SHOW_CONTEXT_SETTINGS && id === 'context'

export const isHiddenBundledPlugin = (id: string): boolean => !SHOW_KANBAN && id === 'kanban'
