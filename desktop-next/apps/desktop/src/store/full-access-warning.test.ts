import { beforeEach, describe, expect, it } from 'vitest'

import {
  acknowledgeFullAccess,
  FULL_ACCESS_WARNING_STORAGE_KEY,
  FULL_ACCESS_WARNING_VERSION,
  isFullAccessAcknowledged,
  resetFullAccessAcknowledgement
} from './full-access-warning'

beforeEach(() => window.localStorage.clear())

describe('full access acknowledgement', () => {
  it('is not acknowledged until the user confirms', () => {
    expect(isFullAccessAcknowledged('/work/alpha')).toBe(false)
  })

  it('is kept per project: confirming one project does not cover another', () => {
    acknowledgeFullAccess('/work/alpha')

    expect(isFullAccessAcknowledged('/work/alpha')).toBe(true)
    expect(isFullAccessAcknowledged('/work/bravo')).toBe(false)
  })

  it('keeps every project the user confirmed, not only the latest', () => {
    acknowledgeFullAccess('/work/alpha')
    acknowledgeFullAccess('/work/bravo')

    expect(isFullAccessAcknowledged('/work/alpha')).toBe(true)
    expect(isFullAccessAcknowledged('/work/bravo')).toBe(true)
  })

  it('asks again after the warning version changes', () => {
    window.localStorage.setItem(
      FULL_ACCESS_WARNING_STORAGE_KEY,
      JSON.stringify({ '/work/alpha': `${FULL_ACCESS_WARNING_VERSION}-old` })
    )

    expect(isFullAccessAcknowledged('/work/alpha')).toBe(false)
  })

  it('never treats an unknown project as acknowledged and does not record one', () => {
    acknowledgeFullAccess('')

    expect(isFullAccessAcknowledged('')).toBe(false)
    expect(window.localStorage.getItem(FULL_ACCESS_WARNING_STORAGE_KEY)).toBeNull()
  })

  it('reset makes one project ask again and leaves the others', () => {
    acknowledgeFullAccess('/work/alpha')
    acknowledgeFullAccess('/work/bravo')

    resetFullAccessAcknowledgement('/work/alpha')

    expect(isFullAccessAcknowledged('/work/alpha')).toBe(false)
    expect(isFullAccessAcknowledged('/work/bravo')).toBe(true)
  })

  it('survives corrupt storage by asking again', () => {
    window.localStorage.setItem(FULL_ACCESS_WARNING_STORAGE_KEY, '{not json')

    expect(isFullAccessAcknowledged('/work/alpha')).toBe(false)
  })
})
