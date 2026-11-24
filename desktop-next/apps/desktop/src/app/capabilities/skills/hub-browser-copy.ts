/** Plain-English copy for the native skill browser (skills.sh, GitHub lists and the person's own taps). */
export const HUB_BROWSER_COPY = {
  approveHint: 'Waiting for your approval. The install card appears in your chat; allow it there to finish.',
  empty: 'No skills matched. Try a shorter search.',
  hint: 'Search skills.sh and curated GitHub lists. Nothing installs without your approval, and every package is hash-checked first.',
  install: 'Install',
  installed: 'Installed',
  installFailed: 'Could not install the skill',
  installedToast: (name: string) => `${name} installed and ready to use.`,
  placeholder: 'Search skills.sh and GitHub (for example: seo, invoices, sql)',
  preview: 'Preview',
  previewFailed: 'Could not load the preview',
  previewHide: 'Hide preview',
  search: 'Search',
  searching: 'Searching...',
  sourceFailed: (sources: string) => `Some sources did not answer: ${sources}.`,
  title: 'Browse skills'
} as const

/** The first lines of a SKILL.md, enough to judge it without opening a window. */
export function skillExcerpt(markdown: string, maxLines = 40): string {
  const lines = markdown.split('\n')

  return lines.length > maxLines ? `${lines.slice(0, maxLines).join('\n')}\n...` : markdown
}
