import { describe, expect, it } from 'vitest'

import { scan } from '../../../../tools/brand/brand-scan.mjs'

// Vanta is its own product. The old product's name and its publisher's brand stay out of shipped source; the
// scanner lists the few places that are allowed to name them (the licence attribution, the saved-state migration,
// the tests that check the brand is absent, the Company page's third-party worker).
describe('brand guard: no Hermes or Nous in shipped source', () => {
  it('finds none outside the allow-list', () => {
    const found = scan() as Record<string, Array<{ line: number; text: string }>>
    const lines = Object.entries(found).flatMap(([file, hits]) => hits.map(hit => `  ${file}:${hit.line}  ${hit.text}`))

    expect(lines, `Remove the old name, or add the file to ALLOWED in tools/brand/brand-scan.mjs with a reason:\n${lines.join('\n')}`).toEqual([])
  })
})
