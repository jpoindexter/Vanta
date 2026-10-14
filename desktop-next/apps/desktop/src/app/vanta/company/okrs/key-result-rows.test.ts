import { describe, expect, it } from 'vitest'

import { emptyRow, parseKeyResultRows } from './key-result-rows'

const row = (name: string, target: string, current = '0', key = 0) => ({ current, key, name, target })

describe('parseKeyResultRows', () => {
  it('skips rows left completely empty, so an objective can be made with none', () => {
    expect(parseKeyResultRows([emptyRow(0), emptyRow(1)])).toEqual({ ok: true, rows: [] })
  })

  it('reads names and numbers, trimming the name', () => {
    expect(parseKeyResultRows([row('  signups ', '100', '25')])).toEqual({
      ok: true,
      rows: [{ current: 25, name: 'signups', target: 100 }]
    })
  })

  it.each([
    [row('', '100'), 'Key result 1 needs a name.'],
    [row('a', ''), 'Key result 1 needs a target above 0, for example 100.'],
    [row('a', '0'), 'Key result 1 needs a target above 0, for example 100.'],
    [row('a', 'lots'), 'Key result 1 needs a target above 0, for example 100.'],
    [row('a', '10', ''), 'Key result 1 needs a current value, or 0 to start.']
  ])('names the first problem for %j', (bad, problem) => {
    expect(parseKeyResultRows([bad])).toEqual({ ok: false, problem })
  })

  it('numbers the problem by position among the filled rows', () => {
    expect(parseKeyResultRows([row('ok', '5'), emptyRow(9), row('', '3')])).toEqual({
      ok: false,
      problem: 'Key result 2 needs a name.'
    })
  })
})
