import { describe, expect, it } from 'vitest'

import { nextAnnouncement, RESPONSE_COMPLETE } from './live-announcer'

const run = (text: string, isRunning = true, messageId = 'm1') => ({ isRunning, messageId, text })

describe('nextAnnouncement', () => {
  it('says nothing while the first paragraph is still arriving', () => {
    expect(nextAnnouncement(null, run('I will read the handler and')).lines).toEqual([])
  })

  it('announces a paragraph once the next one has started, never per token', () => {
    const first = nextAnnouncement(null, run('First paragraph.\n\nSecond par'))

    expect(first.lines).toEqual(['First paragraph.'])

    const again = nextAnnouncement(first.state, run('First paragraph.\n\nSecond paragraph grows'))

    expect(again.lines).toEqual([])
  })

  it('announces the remainder and then "Response complete" when the run ends', () => {
    const mid = nextAnnouncement(null, run('One.\n\nTwo'))
    const done = nextAnnouncement(mid.state, run('One.\n\nTwo.', false))

    expect(done.lines).toEqual(['Two.', RESPONSE_COMPLETE])
  })

  it('starts over for a new reply', () => {
    const first = nextAnnouncement(null, run('A.\n\nB.', false, 'm1'))
    const second = nextAnnouncement(first.state, run('C.\n\nD', true, 'm2'))

    expect(second.lines).toEqual(['C.'])
  })

  it('does not announce completion for an empty reply', () => {
    expect(nextAnnouncement(null, run('', false)).lines).toEqual([])
  })
})
