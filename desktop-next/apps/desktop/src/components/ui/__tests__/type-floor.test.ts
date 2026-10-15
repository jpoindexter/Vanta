import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Static-analysis guard for the Vanta type floor (DESIGN-VANTA.md: no text under
// 12px). Source-text scan of shipped renderer code: any `text-[<12px]`
// utility, CSS `font-size`, or `fontSize` literal below 12px fails, and an
// em-relative size under 1em must be wrapped in `max(0.75rem, ...)` because em
// resolves against a parent that may itself be small.

const FLOOR_PX = 12
const SRC_ROOT = resolve(__dirname, '../../..')
const SCANNED = /\.(ts|tsx|css|js)$/
const SKIPPED_DIRS = new Set(['node_modules', 'dist', '__tests__', 'fonts'])

// `font-size: 0.7rem`, `fontSize: 11`, `'font-size': '8px'`, `text-[0.6rem]`,
// `text-[length:0.6rem]`. Group 2 is the number, group 3 the unit.
const SIZE = /(font-?size['"]?\s*[:=]\s*['"`]?|text-\[(?:length:)?)(\d*\.?\d+)(rem|em|px)?(?![\w%.-])/gi

function collect(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    if (SKIPPED_DIRS.has(entry)) {
      return []
    }

    const full = join(dir, entry)

    if (statSync(full).isDirectory()) {
      return collect(full)
    }

    return SCANNED.test(entry) && !/\.test\.[tj]sx?$/.test(entry) ? [full] : []
  })
}

function sizeViolations(source: string): Array<{ line: number; text: string }> {
  const found: Array<{ line: number; text: string }> = []

  source.split('\n').forEach((text, index) => {
    for (const match of text.matchAll(SIZE)) {
      const value = Number(match[2])
      const unit = match[3] ?? 'px'
      const pixels = unit === 'rem' ? value * 16 : unit === 'px' ? value : null

      // A bare em below 1 shrinks with its parent; `max(0.75rem, Nem)` is the
      // safe spelling and does not match this pattern.
      const unsafeEm = unit === 'em' && value < 1

      if ((pixels !== null && pixels < FLOOR_PX) || unsafeEm) {
        found.push({ line: index + 1, text: match[0] })
      }
    }
  })

  return found
}

describe('12px type floor', () => {
  it('detects sub-floor sizes in each supported syntax', () => {
    expect(sizeViolations('<p className="text-[0.6875rem]">').length).toBe(1)
    expect(sizeViolations('<p className="text-[11px]">').length).toBe(1)
    expect(sizeViolations('font-size: 0.72rem;').length).toBe(1)
    expect(sizeViolations('style={{ fontSize: 9 }}').length).toBe(1)
    expect(sizeViolations("'font-size': '8px'").length).toBe(1)
    expect(sizeViolations('className="text-[0.86em]"').length).toBe(1)
  })

  it('accepts sizes at or above the floor, and em wrapped in max()', () => {
    expect(sizeViolations('<p className="text-[0.75rem]">')).toEqual([])
    expect(sizeViolations('<p className="text-[12px] text-[0.8125rem]">')).toEqual([])
    expect(sizeViolations('font-size: 0.875rem; fontSize: 15')).toEqual([])
    expect(sizeViolations('text-[length:max(0.75rem,0.86em)]')).toEqual([])
    expect(sizeViolations('text-[1.25em]')).toEqual([])
  })

  it('finds no shipped renderer text under 12px', () => {
    const violations: string[] = []

    for (const file of collect(SRC_ROOT)) {
      for (const hit of sizeViolations(readFileSync(file, 'utf8'))) {
        violations.push(`${relative(SRC_ROOT, file)}:${hit.line} ${hit.text}`)
      }
    }

    expect(violations).toEqual([])
  })
})
