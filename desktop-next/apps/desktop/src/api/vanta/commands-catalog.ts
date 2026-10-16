/**
 * The slash commands the Vanta adapter backs today. Vanta' catalog has ~100 entries that run in
 * its Python gateway; offering those would promise behaviour Vanta does not have.
 */
const PAIRS: string[][] = [
  ['/new', 'Start a new chat'],
  ['/stop', 'Stop the running turn'],
  ['/model', 'Choose the model for this chat']
]

export function commandsCatalog(): Record<string, unknown> {
  return {
    canon: Object.fromEntries(PAIRS.map(([name]) => [name, name])),
    categories: [{ name: 'Vanta', pairs: PAIRS }],
    commands: {},
    pairs: PAIRS,
    skill_count: 0,
    skills: {},
    sub: {}
  }
}
