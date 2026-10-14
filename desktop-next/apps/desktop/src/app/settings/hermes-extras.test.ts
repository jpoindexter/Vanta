import { describe, expect, it } from 'vitest'

import { CONFIG_SUBPAGES, configSubpageForField } from './config-subpages'
import { isHiddenModelSubpage, SHOW_HERMES_MODEL_EXTRAS } from './hermes-extras'

describe('Model settings sub-pages Vanta does not serve', () => {
  it('stay hidden by default', () => {
    expect(SHOW_HERMES_MODEL_EXTRAS).toBe(false)
    expect(isHiddenModelSubpage('auxiliary')).toBe(true)
    expect(isHiddenModelSubpage('moa')).toBe(true)
  })

  it('never hides the pages Vanta does serve', () => {
    for (const id of ['main', 'fallbacks', undefined]) {
      expect(isHiddenModelSubpage(id)).toBe(false)
    }
  })

  it('are missing from the Model sub-page list', () => {
    expect(CONFIG_SUBPAGES.model.map(page => page.id)).toEqual(['main', 'fallbacks'])
    expect(configSubpageForField('model', 'auxiliary.vision.model')).toBeUndefined()
    expect(configSubpageForField('model', 'fallback_providers')).toBe('fallbacks')
  })
})
