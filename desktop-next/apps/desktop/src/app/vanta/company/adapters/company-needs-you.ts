import { useEffect, useState } from 'react'

import { type CompanyApi, sharedCompanyApi } from '@/api/vanta-company'
import type { TicketSummary } from '@/api/vanta-company-schemas'
import { COMPANY_ROUTE } from '@/app/routes'

import type { BlockState, NeedsYouItem } from '../../types'
import { REFETCH_DEBOUNCE_MS } from '../use-company-live'

/** Ids of company rows in Home's Needs you start with this, so Open can tell them from chats. */
export const COMPANY_ITEM_PREFIX = 'company:ticket:'

const TICKET_LIMIT = 200
const MAX_ITEMS = 5

export function companyTicketIdOf(itemId: string): null | string {
  return itemId.startsWith(COMPANY_ITEM_PREFIX) ? itemId.slice(COMPANY_ITEM_PREFIX.length) : null
}

/** Where Open goes for a company row: the ticket's own page in the Company screen. */
export function companyItemRoute(itemId: string): null | string {
  const ticketId = companyTicketIdOf(itemId)

  return ticketId ? `${COMPANY_ROUTE}?tab=tickets&ticket=${encodeURIComponent(ticketId)}` : null
}

function itemFor(ticket: TicketSummary): NeedsYouItem | null {
  if (ticket.status === 'blocked') {
    return {
      canAllowOnce: false,
      detail: ticket.blocker ? `Blocked: ${ticket.blocker}` : 'Blocked and waiting for your answer',
      id: `${COMPANY_ITEM_PREFIX}${ticket.id}`,
      title: ticket.title
    }
  }

  if (ticket.status === 'in_review' && ticket.pendingReviews > 0) {
    return {
      canAllowOnce: false,
      detail: 'Work is ready for your review',
      id: `${COMPANY_ITEM_PREFIX}${ticket.id}`,
      title: ticket.title
    }
  }

  return null
}

/** Blocked tickets and work waiting for the owner's approval, as Home "Needs you" rows. */
export function companyNeedsYouItems(tickets: readonly TicketSummary[]): NeedsYouItem[] {
  return tickets.flatMap(ticket => itemFor(ticket) ?? []).slice(0, MAX_ITEMS)
}

/**
 * Chat rows first, then company rows. If the company feed failed or is still loading, the chat
 * rows stand alone: a company hiccup must not hide the approvals the person is waiting on.
 */
export function mergeNeedsYou(
  chats: BlockState<NeedsYouItem>,
  company: BlockState<NeedsYouItem>
): BlockState<NeedsYouItem> {
  if (chats.status !== 'ready' || company.status !== 'ready') {
    return chats
  }

  return { items: [...chats.items, ...company.items], status: 'ready' }
}

/** The company's share of Needs you, live. Quiet ("ready", no rows) in a window without the Vanta bridge. */
export function useCompanyNeedsYou(api: CompanyApi | null = sharedCompanyApi()): BlockState<NeedsYouItem> {
  const [state, setState] = useState<BlockState<NeedsYouItem>>({ status: 'loading' })

  useEffect(() => {
    if (!api) {
      setState({ items: [], status: 'ready' })

      return
    }

    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined

    const load = () =>
      void api.readTickets({ limit: TICKET_LIMIT }).then(result => {
        if (live) {
          setState(
            result.ok
              ? { items: companyNeedsYouItems(result.data.tickets), status: 'ready' }
              : { message: result.message, status: 'error' }
          )
        }
      })

    load()

    const stop = api.subscribe(signal => {
      if (signal.kind === 'company' && signal.event.type === 'ticket.updated') {
        clearTimeout(timer)
        timer = setTimeout(load, REFETCH_DEBOUNCE_MS)
      }
    })

    return () => {
      live = false
      clearTimeout(timer)
      stop()
    }
  }, [api])

  return state
}
