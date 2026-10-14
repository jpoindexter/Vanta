// The Model settings sub-pages Vanta does not serve: Auxiliary models lists helper
// tasks Vanta has no slot for (the server refuses every change), and Mixture of
// Agents has no Vanta backend. They stay in the tree behind this one switch so
// bringing them back is a one-line change.
export const SHOW_HERMES_MODEL_EXTRAS = false

const HIDDEN_MODEL_SUBPAGES: ReadonlySet<string> = new Set(['auxiliary', 'moa'])

export function isHiddenModelSubpage(id: string | undefined): boolean {
  return !SHOW_HERMES_MODEL_EXTRAS && id !== undefined && HIDDEN_MODEL_SUBPAGES.has(id)
}
