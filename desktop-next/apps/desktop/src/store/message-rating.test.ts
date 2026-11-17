import { beforeEach, describe, expect, it } from 'vitest'

import { $messageRatings, rateMessage } from './message-rating'

beforeEach(() => {
  $messageRatings.set({})
  window.localStorage.clear()
})

describe('rateMessage', () => {
  it('records a rating and clears it when the same one is chosen again', () => {
    rateMessage('m1', 'up')
    expect($messageRatings.get()).toEqual({ m1: 'up' })

    rateMessage('m1', 'up')
    expect($messageRatings.get()).toEqual({})
  })

  it('switches between up and down for one message', () => {
    rateMessage('m1', 'up')
    rateMessage('m1', 'down')
    expect($messageRatings.get()).toEqual({ m1: 'down' })
  })

  it('persists across a reload of the store', () => {
    rateMessage('m2', 'down')
    expect(JSON.parse(window.localStorage.getItem('vanta.desktop.message-ratings.v1') ?? '{}')).toEqual({ m2: 'down' })
  })
})
