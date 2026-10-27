import { expect, it } from 'vitest'
import { homeAttachmentIntent } from './home-attachment-intent'
const owner = { connectionId: 'local', profile: 'writer' }
const source = () => ({ window: 'main', revision: crypto.randomUUID() })

it('captures only bounded source quote and owner without altering legacy text drafts', () => {
  expect(homeAttachmentIntent({ prompt: 'Legacy' })).toBeUndefined()
  const input = { intent: 'submit-home', owner: { ...owner }, source: source() }
  const captured = homeAttachmentIntent(input)!
  input.source.window = 'other'; input.owner.profile = 'other'
  expect(captured.owner).toEqual(owner)
  expect(captured.source?.window).toBe('main')
  expect(Object.isFrozen(captured.source)).toBe(true)
})

it.each([null, {}, { window: 'other', revision: crypto.randomUUID() }, { window: 'main', revision: 'bad' }])('refuses malformed Home source before native preparation: %j', source => {
  expect(() => homeAttachmentIntent({ intent: 'submit-home', owner, source })).toThrow()
})
