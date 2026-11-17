import { type FC, useState } from 'react'

import { ChevronRight, FileText } from '@/lib/icons'
import { cn } from '@/lib/utils'

import {
  type CanvasBoard,
  type CanvasChart,
  type CanvasData,
  type CanvasTable,
  CHART_SIZE,
  canvasMeta,
  chartGeometry,
  formatCell
} from './canvas-model'

// Series are told apart by tint, not hue: ink at falling opacity (the legend carries the same tints).
const SERIES_OPACITY = [1, 0.6, 0.35, 0.2, 0.12, 0.08] as const
const seriesOpacity = (index: number): number => SERIES_OPACITY[index] ?? SERIES_OPACITY[SERIES_OPACITY.length - 1]
const BAR_GAP = 2

const TableView: FC<{ table: CanvasTable }> = ({ table }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-meta">
      <thead>
        <tr className="border-b border-border text-muted-foreground">
          {table.columns.map(column => (
            <th
              className={cn('px-2 py-1.5 font-medium', column.format && column.format !== 'text' && 'text-right')}
              key={column.key}
              scope="col"
            >
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, index) => (
          <tr className="border-b border-border/60 last:border-0" key={index}>
            {table.columns.map(column => (
              <td
                className={cn('px-2 py-1.5', column.format && column.format !== 'text' && 'text-right tabular-nums')}
                key={column.key}
              >
                {formatCell(row[column.key], column.format)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

const BoardView: FC<{ board: CanvasBoard }> = ({ board }) => (
  <div className="flex gap-2 overflow-x-auto">
    {board.columns.map(column => (
      <section aria-label={column.title} className="flex min-w-40 flex-1 flex-col gap-1.5" key={column.title}>
        <h4 className="px-0.5 text-meta font-medium text-muted-foreground">
          {column.title} <span className="tabular-nums">{column.items.length}</span>
        </h4>
        {column.items.map((item, index) => (
          <div className="rounded-lg border border-border bg-background px-2.5 py-2" key={index}>
            <div className="text-ui font-medium text-foreground">{item.title}</div>
            {item.detail && <div className="mt-0.5 text-meta text-muted-foreground">{item.detail}</div>}
            {(item.status || item.metric) && (
              <div className="mt-1 flex justify-between gap-2 text-meta text-muted-foreground">
                <span>{item.status}</span>
                <span className="tabular-nums">{item.metric}</span>
              </div>
            )}
          </div>
        ))}
      </section>
    ))}
  </div>
)

const ChartView: FC<{ chart: CanvasChart }> = ({ chart }) => {
  const { max, points } = chartGeometry(chart)
  const { height, pad, width } = CHART_SIZE
  const step = (width - pad * 2) / chart.categories.length
  const barWidth = Math.max(1, step / chart.series.length - BAR_GAP)

  return (
    <figure className="flex flex-col gap-2 text-foreground">
      <svg aria-label={`${chart.title}: ${chart.type} chart, top value ${max}`} className="w-full" role="img" viewBox={`0 0 ${width} ${height}`}>
        <line stroke="currentColor" strokeOpacity={0.2} x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} />
        {chart.type === 'bar'
          ? points.flatMap((series, seriesIndex) =>
              series.map((point, index) => (
                <rect
                  fill="currentColor"
                  fillOpacity={seriesOpacity(seriesIndex)}
                  height={height - pad - point.y}
                  key={`${seriesIndex}-${index}`}
                  width={barWidth}
                  x={pad + step * index + (step - barWidth * chart.series.length - BAR_GAP * (chart.series.length - 1)) / 2 + seriesIndex * (barWidth + BAR_GAP)}
                  y={point.y}
                />
              ))
            )
          : points.map((series, seriesIndex) => (
              <polyline
                fill="none"
                key={seriesIndex}
                points={series.map(point => `${point.x},${point.y}`).join(' ')}
                stroke="currentColor"
                strokeLinejoin="round"
                strokeOpacity={seriesOpacity(seriesIndex)}
                strokeWidth={2}
              />
            ))}
      </svg>
      <div className="flex justify-between gap-1 text-meta text-muted-foreground">
        {chart.categories.map(category => (
          <span className="min-w-0 flex-1 truncate text-center" key={category}>
            {category}
          </span>
        ))}
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-muted-foreground">
        {chart.series.map((series, index) => (
          <span className="inline-flex items-center gap-1" key={series.name}>
            <span className="size-2 rounded-sm bg-foreground" style={{ opacity: seriesOpacity(index) }} />
            {series.name}
          </span>
        ))}
        {(chart.xLabel || chart.yLabel) && <span>{[chart.yLabel, chart.xLabel].filter(Boolean).join(' by ')}</span>}
      </figcaption>
    </figure>
  )
}

/** A chart, table or board the agent made, shown in the thread. The header opens and closes the view. */
export const CanvasCard: FC<{ canvas: CanvasData }> = ({ canvas }) => {
  const [open, setOpen] = useState(true)

  return (
    <div
      className={cn('w-full max-w-160 overflow-hidden rounded-xl border bg-card', open ? 'border-foreground' : 'border-border')}
      data-slot="canvas-card"
    >
      <button
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/40"
        onClick={() => setOpen(current => !current)}
        type="button"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border text-muted-foreground">
          <FileText className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-ui font-semibold text-foreground">{canvas.title}</span>
          <span className="block truncate text-meta text-muted-foreground">{canvasMeta(canvas)}</span>
        </span>
        <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2.5">
          {canvas.kind === 'table' ? (
            <TableView table={canvas} />
          ) : canvas.kind === 'board' ? (
            <BoardView board={canvas} />
          ) : (
            <ChartView chart={canvas} />
          )}
        </div>
      )}
    </div>
  )
}

export const CanvasCards: FC<{ canvases: readonly CanvasData[] }> = ({ canvases }) =>
  canvases.length === 0 ? null : (
    <div className="mt-3 flex flex-col gap-2">
      {canvases.map((canvas, index) => (
        <CanvasCard canvas={canvas} key={`${canvas.title}-${index}`} />
      ))}
    </div>
  )
