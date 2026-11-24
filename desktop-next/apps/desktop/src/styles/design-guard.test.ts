import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { CATEGORIES, scan, SRC, total } from '../../../../tools/design/design-scan.mjs'

const baseline: Record<string, Record<string, number>> = JSON.parse(
  fs.readFileSync(path.join(SRC, 'styles', 'design-guard.baseline.json'), 'utf8')
)

const RULE: Record<string, string> = {
  'arbitrary-color': 'use a colour token (`text-foreground`, `bg-muted`, `text-(--ui-text-secondary)`), not `bg-[#hex]`',
  'arbitrary-text-size': 'use a step on the type scale (`text-xs`, `text-sm`, `text-base`), not `text-[13px]`',
  'hex-color': 'use a token (`var(--ui-…)`, `var(--dt-…)`), or add the colour to the theme if the system lacks it',
  'left-accent-stripe':
    'drop the coloured left bar: say status in a label, a dot or the text colour (a neutral 1px divider or a blockquote rule is fine)',
  'literal-radius': 'use a ramp step (`rounded-lg`, `var(--radius-lg)`) or a role (`rounded-control`, `rounded-surface`, `rounded-pill`)'
}

// The design system is the only place literal values live. This is a ratchet: today's counts are the
// ceiling, a file may only go down, and no file may start. `node tools/design/guard-baseline.mjs` lowers
// the ceiling after a migration.
describe('design guard: nothing hard-coded outside the design system', () => {
  const current = scan() as Record<string, Record<string, number>>

  it.each(Object.keys(CATEGORIES))('%s never rises above the baseline', category => {
    const rises = Object.entries(current[category] ?? {})
      .filter(([file, count]) => count > (baseline[category]?.[file] ?? 0))
      .map(([file, count]) => `  ${file}: ${baseline[category]?.[file] ?? 0} -> ${count}`)

    expect(rises, `${category} went up in:\n${rises.join('\n')}\nFix: ${RULE[category]}.`).toEqual([])
  })

  it('has a baseline for every category, so a new category cannot slip in unmeasured', () => {
    expect(Object.keys(baseline).sort()).toEqual(Object.keys(CATEGORIES).sort())
  })

  it('reports the literal-radius total so a migration is visible', () => {
    expect(total(current['literal-radius'] ?? {})).toBeLessThanOrEqual(total(baseline['literal-radius'] ?? {}))
  })
})
