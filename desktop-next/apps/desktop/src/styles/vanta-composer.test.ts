import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// The configured UI project stubs CSS imports, including ?raw. Read declarations
// from the documented app working directory rather than asserting on that stub.
const skin = readFileSync(path.resolve('src/styles/vanta.css'), 'utf8')
const composer = readFileSync(path.resolve('src/styles/vanta-composer.css'), 'utf8')

// Declaration-contract proof only. Actual cascade, focus and geometry need a renderer.
describe('approved composer presentation contract', () => {
  it('keeps surface, inset, label and icon decisions in the Vanta semantic owner', () => {
    expect(skin).toContain('--composer-surface-background: var(--dt-background)')
    expect(skin).toContain('--composer-surface-inset: 0.75rem')
    expect(skin).toContain('--composer-label-size: 0.875rem')
    expect(skin).toContain('--composer-label-leading: 1.25rem')
    expect(skin).toContain('--composer-icon-size: 1.125rem')
    expect(skin).toContain('--composer-control-size: 2rem')
    expect(composer).toContain('border-radius: var(--radius-composer)')
    expect(composer).toContain('box-shadow: var(--shadow-composer)')
    expect(composer).toContain('.desktop-input-chrome[data-slot=\'composer-surface\'][data-vp=\'composer\']')
    expect(composer).toContain('max-inline-size: var(--vp-column)')
  })

  it('uses the same opaque fill for the surface and its backing, with a raised dark seed', () => {
    expect(composer).toContain('--composer-fill: var(--composer-surface-background)')
    expect(composer).toContain('background: var(--composer-surface-background)')
    expect(skin).toMatch(/\[data-vanta-mode='dark'\]\s*\{\s*--composer-surface-background: var\(--theme-card-seed\)/)
  })

  it('restores Home and chat button focus without adding an outer ring around button focus', () => {
    expect(composer).toContain("[data-slot='composer-surface'][data-vp='composer'] button:focus-visible")
    expect(skin).toContain(":has([data-vp='composer-input']:focus-visible)")
    expect(skin).toContain(":not([data-hud-shell] *):has([data-vp='composer-input']:focus-visible)")
    expect(skin).not.toContain("[data-slot='composer-surface']:focus-within")
    expect(composer).toContain('outline-offset: 2px')
    expect(composer).toContain('outline-color: Highlight')
    expect(composer).toContain('border-color: CanvasText !important')
  })

  it('scopes footer labels and icons without resetting editor text scaling or disabled hover', () => {
    expect(composer).toContain("[data-slot='composer-controls'] [data-slot='button']")
    expect(composer).toContain('font-size: var(--composer-label-size)')
    expect(composer).toContain('line-height: var(--composer-label-leading)')
    expect(composer).toContain('inline-size: var(--composer-icon-size)')
    expect(composer).toContain(':not(:disabled):not([aria-disabled=\'true\'])')
  })

  it('paints both send markers with theme ink and keeps aria-disabled Home send neutral', () => {
    expect(composer).toContain(":root[data-vanta-theme='vanta'] :is([data-slot='composer-send'], [data-vp='composer-send'])")
    expect(composer).toContain('background: var(--theme-foreground)')
    expect(composer).toContain('color: var(--theme-background-seed)')
    expect(composer).toContain(":is(:disabled, [aria-disabled='true'])")
  })
})
