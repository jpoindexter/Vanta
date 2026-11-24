import { describe, expect, it } from 'vitest'

import { RECORDED } from '../fixtures/recorded'

import { companyItemRoute, companyNeedsYouItems, companyTicketIdOf, mergeNeedsYou } from './company-needs-you'

describe('company Needs you adapter, on tickets recorded from the real server', () => {
  const items = companyNeedsYouItems(RECORDED.tickets.tickets)

  it('turns a blocked ticket into a row that carries the blocker', () => {
    const blocked = items.find(item => item.id === 'company:ticket:T-4')

    expect(blocked).toEqual({
      canAllowOnce: false,
      detail: 'Blocked: run failed: need the brand colour for the checkout buttons',
      id: 'company:ticket:T-4',
      title: 'Fix the checkout buttons [block]'
    })
  })

  it('turns work waiting for approval into a review row', () => {
    expect(items.find(item => item.id === 'company:ticket:T-3')?.detail).toBe('Work is ready for your review')
  })

  it('leaves out tickets that wait on nobody', () => {
    expect(items.map(item => item.id).sort()).toEqual(['company:ticket:T-3', 'company:ticket:T-4'])
  })

  it('routes a row to its ticket and ignores chat ids', () => {
    expect(companyItemRoute('company:ticket:T-3')).toBe('/company?tab=tickets&ticket=T-3')
    expect(companyItemRoute('session-1')).toBeNull()
    expect(companyTicketIdOf('company:ticket:T-4')).toBe('T-4')
  })
})

describe('mergeNeedsYou', () => {
  const chat = { items: [{ canAllowOnce: true, detail: 'a', id: 's1', title: 'Chat' }], status: 'ready' as const }
  const company = {
    items: [{ canAllowOnce: false, detail: 'b', id: 'company:ticket:T-1', title: 'Ticket' }],
    status: 'ready' as const
  }

  it('puts chats first, then company rows', () => {
    expect(mergeNeedsYou(chat, company)).toEqual({ items: [...chat.items, ...company.items], status: 'ready' })
  })

  it('keeps the chat rows when the company feed failed or is loading', () => {
    expect(mergeNeedsYou(chat, { message: 'down', status: 'error' })).toBe(chat)
    expect(mergeNeedsYou(chat, { status: 'loading' })).toBe(chat)
  })
})
