import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { CanvasCards } from './canvas-card'
import type { CanvasData } from './canvas-model'

afterEach(cleanup)

const table: CanvasData = {
  columns: [
    { key: 'vendor', label: 'Vendor' },
    { format: 'percent', key: 'share', label: 'Share' }
  ],
  kind: 'table',
  rows: [{ share: 40, vendor: 'Acme' }, { share: 25, vendor: 'Bravo' }],
  title: 'Market share'
}

describe('CanvasCards', () => {
  it('renders a table with its headers and formatted cells, open by default', () => {
    render(<CanvasCards canvases={[table]} />)

    expect(screen.getByText('Market share')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Share' })).toBeTruthy()
    expect(screen.getByText('40%')).toBeTruthy()
    expect(screen.getByText('Canvas · Table · 2 rows')).toBeTruthy()
  })

  it('collapses and reopens from the header', () => {
    render(<CanvasCards canvases={[table]} />)
    const header = screen.getByRole('button', { name: /Market share/ })

    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('table')).toBeNull()

    fireEvent.click(header)
    expect(screen.getByRole('table')).toBeTruthy()
  })

  it('renders board columns with their items', () => {
    render(
      <CanvasCards
        canvases={[
          {
            columns: [{ items: [{ detail: 'Due Friday', metric: '$4k', status: 'Open', title: 'Send quote' }], title: 'To do' }],
            kind: 'board',
            title: 'Deals'
          }
        ]}
      />
    )

    expect(screen.getByRole('region', { name: 'To do' })).toBeTruthy()
    expect(screen.getByText('Send quote')).toBeTruthy()
    expect(screen.getByText('$4k')).toBeTruthy()
  })

  it('renders a chart as a labelled image with one bar per value and a legend', () => {
    const { container } = render(
      <CanvasCards
        canvases={[
          {
            categories: ['W1', 'W2'],
            kind: 'chart',
            series: [{ name: 'Acme', values: [3, 5] }, { name: 'Bravo', values: [2, 4] }],
            title: 'Sales',
            type: 'bar'
          }
        ]}
      />
    )

    expect(screen.getByRole('img', { name: /Sales: bar chart, top value 5/ })).toBeTruthy()
    expect(container.querySelectorAll('svg rect')).toHaveLength(4)
    expect(screen.getByText('Bravo')).toBeTruthy()
  })

  it('renders nothing when there are no canvases', () => {
    const { container } = render(<CanvasCards canvases={[]} />)

    expect(container.firstChild).toBeNull()
  })
})
