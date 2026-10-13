import { describe, expect, it } from 'vitest'

import type { SessionInfo } from '@/types/hermes'

import { needsYouItems, nextUpItems, projectChips, recentOutputItems, runningItems } from './home-model'

const session = (id: string, title: string): SessionInfo =>
  ({
    id,
    input_tokens: 0,
    last_active: 0,
    message_count: 2,
    output_tokens: 0,
    title
  }) as unknown as SessionInfo

const sessions = [session('a', 'Needs approval'), session('b', 'Running task'), session('c', 'Quiet')]

describe('home model', () => {
  it('lists a chat waiting on an approval under Needs you with Allow once, and a running one under Running now', () => {
    const input = {
      dots: { b: 'working' as const },
      facts: { a: 'approval' as const }
    }

    expect(needsYouItems(sessions, input)).toEqual([
      {
        canAllowOnce: true,
        detail: 'Waiting for your approval',
        id: 'a',
        title: 'Needs approval'
      }
    ])
    expect(runningItems(sessions, input).map(item => item.id)).toEqual(['b'])
  })

  it('offers no Allow once for a question the person must answer', () => {
    const [item] = needsYouItems(sessions, {
      dots: {},
      facts: { a: 'input' as const }
    })

    expect(item.canAllowOnce).toBe(false)
  })

  it('shows active schedules in Next up and skips paused ones', () => {
    const items = nextUpItems(
      [
        {
          enabled: true,
          id: '1',
          name: 'Brief',
          schedule_display: '0 9 * * 1',
          state: 'scheduled'
        },
        {
          enabled: false,
          id: '2',
          name: 'Off',
          schedule_display: '* * * * *',
          state: 'paused'
        }
      ],
      Date.now()
    )

    expect(items.map(item => item.id)).toEqual(['1'])
    expect(items[0].action).toBe('edit')
  })

  it('shows only files and canvases as recent outputs, newest first', () => {
    const items = recentOutputItems([
      {
        id: '1',
        kind: 'link',
        label: 'https://x.test',
        value: 'https://x.test'
      },
      { id: '2', kind: 'file', label: 'a.md', value: '/p/a.md' },
      { id: '3', kind: 'file', label: 'b.md', value: '/p/b.md' }
    ])

    expect(items.map(item => item.name)).toEqual(['b.md', 'a.md'])
  })

  it('offers projects by name and hides archived ones', () => {
    expect(
      projectChips([
        { archived: false, id: 'p1', name: 'Acme', primary_path: '/acme' },
        { archived: true, id: 'p2', name: 'Old', primary_path: '/old' }
      ] as never)
    ).toEqual([{ id: 'p1', name: 'Acme' }])
  })
})
