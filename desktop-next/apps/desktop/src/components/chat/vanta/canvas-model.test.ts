import { describe, expect, it } from 'vitest'

import { canvasesFromParts, canvasMeta, chartGeometry, formatCell } from './canvas-model'

const call = (args: unknown, extra: object = {}) => ({
  args,
  result: 'rendered table canvas "x" · .vanta/canvas.json · id',
  toolName: 'render_canvas',
  type: 'tool-call',
  ...extra
})

const table = {
  kind: 'table',
  table: {
    columns: [
      { key: 'vendor', label: 'Vendor' },
      { format: 'currency', key: 'price', label: 'Price' }
    ],
    rows: [{ price: 49, vendor: 'Acme' }, { price: 59, vendor: 'Bravo' }]
  },
  title: 'Pricing'
}

describe('canvasesFromParts', () => {
  it('reads a table from the tool arguments', () => {
    const [canvas] = canvasesFromParts([call(table)])

    expect(canvas).toMatchObject({ kind: 'table', title: 'Pricing' })
    expect(canvasMeta(canvas!)).toBe('Canvas · Table · 2 rows')
  })

  it('reads a board and a chart', () => {
    const board = { board: { columns: [{ items: [{ title: 'Send quote' }], title: 'To do' }] }, kind: 'board', title: 'Deals' }
    const chart = {
      chart: { categories: ['W1', 'W2'], series: [{ name: 'Sales', values: [3, 5] }], type: 'bar' },
      kind: 'chart',
      title: 'Sales'
    }
    const found = canvasesFromParts([call(board), call(chart)])

    expect(found.map(c => c.kind)).toEqual(['board', 'chart'])
    expect(canvasMeta(found[1]!)).toBe('Canvas · Bar chart · 1 series')
  })

  it('draws nothing for a call that has no successful answer', () => {
    expect(canvasesFromParts([call(table, { result: undefined })])).toEqual([])
    expect(canvasesFromParts([call(table, { result: 'invalid canvas artifact: bad' })])).toEqual([])
  })

  it('accepts the metadata summary when the server sent no result', () => {
    const found = canvasesFromParts([
      call(table, { result: undefined, toolResultMetadata: { summary: 'rendered table canvas "Pricing" · .vanta/canvas.json · id' } })
    ])

    expect(found).toHaveLength(1)
  })

  it('skips malformed, failed and other-tool calls instead of throwing', () => {
    const found = canvasesFromParts([
      call({ kind: 'table', title: 'No table' }),
      call({ chart: { categories: ['a'], series: [{ name: 's', values: [1, 2] }], type: 'bar' }, kind: 'chart', title: 'Mismatch' }),
      call({ kind: 'nope', title: 'x' }),
      call(table, { isError: true }),
      { args: table, toolName: 'write_file', type: 'tool-call' },
      call('not an object')
    ])

    expect(found).toEqual([])
  })

  it('keeps only the last two canvases', () => {
    const many = ['a', 'b', 'c'].map(title => call({ ...table, title }))

    expect(canvasesFromParts(many).map(c => c.title)).toEqual(['b', 'c'])
  })

  it('drops non-scalar cells', () => {
    const [canvas] = canvasesFromParts([call({ ...table, table: { ...table.table, rows: [{ price: 1, vendor: { nested: true } }] } })])

    expect(canvas).toMatchObject({ rows: [{ price: 1 }] })
  })
})

describe('formatCell', () => {
  it('formats by the declared format and tolerates odd values', () => {
    expect(formatCell(0.5, 'percent')).toBe('0.5%')
    expect(formatCell(1200, 'number')).toBe((1200).toLocaleString())
    expect(formatCell(null, 'text')).toBe('')
    expect(formatCell(undefined, 'currency')).toBe('')
    expect(formatCell(true, 'text')).toBe('true')
    expect(formatCell(5, 'currency')).toContain('5')
  })
})

describe('chartGeometry', () => {
  it('puts the largest value at the top and zero on the baseline', () => {
    const { max, points } = chartGeometry({
      categories: ['a', 'b'],
      kind: 'chart',
      series: [{ name: 's', values: [0, 10] }],
      title: 't',
      type: 'line'
    })

    expect(max).toBe(10)
    expect(points[0]![1]!.y).toBeLessThan(points[0]![0]!.y)
    expect(points[0]![1]!.y).toBe(8)
  })

  it('does not divide by zero when every value is zero', () => {
    const { points } = chartGeometry({ categories: ['a'], kind: 'chart', series: [{ name: 's', values: [0] }], title: 't', type: 'bar' })

    expect(Number.isFinite(points[0]![0]!.y)).toBe(true)
  })
})
