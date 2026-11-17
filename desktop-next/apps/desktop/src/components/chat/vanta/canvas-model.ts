/**
 * Canvas cards: the chart, table or board the agent made with `render_canvas`. The tool call's own arguments are the
 * artifact (the server validated them before drawing), so the card reads them from the transcript. Everything is
 * re-checked structurally here, because a malformed call must never crash the thread.
 */

export type CanvasScalar = boolean | null | number | string

export interface CanvasChart {
  categories: string[]
  kind: 'chart'
  series: Array<{ name: string; values: number[] }>
  title: string
  type: 'bar' | 'line'
  xLabel?: string
  yLabel?: string
}

export interface CanvasTable {
  columns: Array<{ format?: 'currency' | 'number' | 'percent' | 'text'; key: string; label: string }>
  kind: 'table'
  rows: Array<Record<string, CanvasScalar>>
  title: string
}

export interface CanvasBoard {
  columns: Array<{ items: Array<{ detail?: string; metric?: string; status?: string; title: string }>; title: string }>
  kind: 'board'
  title: string
}

export type CanvasData = CanvasBoard | CanvasChart | CanvasTable

interface ToolPartLike {
  args?: unknown
  isError?: boolean
  result?: unknown
  toolName?: string
  toolResultMetadata?: { summary?: unknown }
  type: string
}

const RENDER_TOOL = 'render_canvas'
// The tool answers "rendered <kind> canvas ..." when it drew; anything else (an error, no answer yet) draws nothing.
const RENDERED_RE = /^rendered (?:chart|table|board) canvas/
const MAX_CANVAS_CARDS = 2

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isString = (value: unknown): value is string => typeof value === 'string'
const isScalar = (value: unknown): value is CanvasScalar =>
  value === null || ['boolean', 'number', 'string'].includes(typeof value)

const strings = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every(isString) ? (value as string[]) : null

function parseChart(title: string, raw: unknown): CanvasChart | null {
  if (!isRecord(raw) || (raw.type !== 'bar' && raw.type !== 'line')) {
    return null
  }

  const categories = strings(raw.categories)
  const series = Array.isArray(raw.series) ? raw.series : null

  if (!categories?.length || !series?.length) {
    return null
  }

  const parsed: CanvasChart['series'] = []

  for (const item of series) {
    const values = isRecord(item) && Array.isArray(item.values) ? item.values : null

    if (!isRecord(item) || !isString(item.name) || !values || values.length !== categories.length) {
      return null
    }

    if (!values.every(value => typeof value === 'number' && Number.isFinite(value))) {
      return null
    }

    parsed.push({ name: item.name, values: values as number[] })
  }

  return {
    categories,
    kind: 'chart',
    series: parsed,
    title,
    type: raw.type,
    ...(isString(raw.xLabel) ? { xLabel: raw.xLabel } : {}),
    ...(isString(raw.yLabel) ? { yLabel: raw.yLabel } : {})
  }
}

const FORMATS = new Set(['currency', 'number', 'percent', 'text'])

function parseTable(title: string, raw: unknown): CanvasTable | null {
  if (!isRecord(raw) || !Array.isArray(raw.columns) || !Array.isArray(raw.rows) || raw.columns.length === 0) {
    return null
  }

  const columns: CanvasTable['columns'] = []

  for (const column of raw.columns) {
    if (!isRecord(column) || !isString(column.key) || !isString(column.label)) {
      return null
    }

    columns.push({
      key: column.key,
      label: column.label,
      ...(isString(column.format) && FORMATS.has(column.format) ? { format: column.format as 'text' } : {})
    })
  }

  const rows = raw.rows.filter(isRecord).map(row => {
    const clean: Record<string, CanvasScalar> = {}

    for (const [key, value] of Object.entries(row)) {
      if (isScalar(value)) {
        clean[key] = value
      }
    }

    return clean
  })

  return { columns, kind: 'table', rows, title }
}

function parseBoard(title: string, raw: unknown): CanvasBoard | null {
  if (!isRecord(raw) || !Array.isArray(raw.columns) || raw.columns.length === 0) {
    return null
  }

  const columns: CanvasBoard['columns'] = []

  for (const column of raw.columns) {
    if (!isRecord(column) || !isString(column.title) || !Array.isArray(column.items)) {
      return null
    }

    const items = column.items.filter(isRecord).filter(item => isString(item.title)) as Array<Record<string, unknown>>

    columns.push({
      items: items.map(item => ({
        title: item.title as string,
        ...(isString(item.detail) ? { detail: item.detail } : {}),
        ...(isString(item.metric) ? { metric: item.metric } : {}),
        ...(isString(item.status) ? { status: item.status } : {})
      })),
      title: column.title
    })
  }

  return { columns, kind: 'board', title }
}

function toolRendered(part: ToolPartLike): boolean {
  const summary = part.toolResultMetadata?.summary
  const text = typeof part.result === 'string' ? part.result : typeof summary === 'string' ? summary : ''

  return RENDERED_RE.test(text.trim())
}

/** The canvases a finished turn made, newest last, at most two. A malformed call is skipped, never thrown on. */
export function canvasesFromParts(parts: readonly ToolPartLike[]): CanvasData[] {
  const found: CanvasData[] = []

  for (const part of parts) {
    if (part.type !== 'tool-call' || part.toolName !== RENDER_TOOL || part.isError || !toolRendered(part) || !isRecord(part.args)) {
      continue
    }

    const { args } = part
    const title = isString(args.title) && args.title.trim() ? args.title.trim() : null

    if (!title) {
      continue
    }

    const canvas =
      args.kind === 'chart'
        ? parseChart(title, args.chart)
        : args.kind === 'table'
          ? parseTable(title, args.table)
          : args.kind === 'board'
            ? parseBoard(title, args.board)
            : null

    if (canvas) {
      found.push(canvas)
    }
  }

  return found.slice(-MAX_CANVAS_CARDS)
}

export function canvasMeta(canvas: CanvasData): string {
  if (canvas.kind === 'table') {
    return `Canvas · Table · ${canvas.rows.length} ${canvas.rows.length === 1 ? 'row' : 'rows'}`
  }

  if (canvas.kind === 'board') {
    return `Canvas · Board · ${canvas.columns.length} ${canvas.columns.length === 1 ? 'column' : 'columns'}`
  }

  return `Canvas · ${canvas.type === 'bar' ? 'Bar' : 'Line'} chart · ${canvas.series.length} series`
}

/** One table cell as text, by the column's declared format. Never throws on an odd value. */
export function formatCell(value: CanvasScalar | undefined, format: CanvasTable['columns'][number]['format']): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'number' && format === 'currency') {
    return value.toLocaleString(undefined, { currency: 'USD', style: 'currency' })
  }

  if (typeof value === 'number' && format === 'percent') {
    return `${value}%`
  }

  if (typeof value === 'number') {
    return value.toLocaleString()
  }

  return String(value)
}

const CHART_WIDTH = 480
const CHART_HEIGHT = 180
const CHART_PAD = 8

export interface ChartPoint {
  x: number
  y: number
}

/** Pixel positions per series for a 480x180 plot. The y-axis starts at zero (values are non-negative). */
export function chartGeometry(chart: CanvasChart): { max: number; points: ChartPoint[][] } {
  const max = Math.max(1, ...chart.series.flatMap(series => series.values))
  const step = (CHART_WIDTH - CHART_PAD * 2) / chart.categories.length
  const plotHeight = CHART_HEIGHT - CHART_PAD * 2

  return {
    max,
    points: chart.series.map(series =>
      series.values.map((value, index) => ({
        x: CHART_PAD + step * index + step / 2,
        y: CHART_PAD + plotHeight - (value / max) * plotHeight
      }))
    )
  }
}

export const CHART_SIZE = { height: CHART_HEIGHT, pad: CHART_PAD, width: CHART_WIDTH } as const
