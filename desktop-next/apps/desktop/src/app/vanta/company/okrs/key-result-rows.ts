export interface KeyResultRow {
  current: string
  key: number
  name: string
  target: string
}

export type ParsedRows = { problem: string; ok: false } | { ok: true; rows: Array<{ current: number; name: string; target: number }> }

export const emptyRow = (key: number): KeyResultRow => ({ current: '0', key, name: '', target: '' })

const isBlank = (row: KeyResultRow) => !row.name.trim() && !row.target.trim()

function number(text: string): number {
  return text.trim() === '' ? Number.NaN : Number(text)
}

/**
 * Turn the form's key-result rows into what the server takes. A row left completely empty is
 * skipped; a row with only half filled in is a problem the owner can fix, named by position.
 */
export function parseKeyResultRows(rows: KeyResultRow[]): ParsedRows {
  const filled = rows.filter(row => !isBlank(row))
  const parsed: Array<{ current: number; name: string; target: number }> = []

  for (const [index, row] of filled.entries()) {
    const place = `Key result ${index + 1}`
    const target = number(row.target)
    const current = number(row.current)

    if (!row.name.trim()) {
      return { ok: false, problem: `${place} needs a name.` }
    }

    if (!Number.isFinite(target) || target <= 0) {
      return { ok: false, problem: `${place} needs a target above 0, for example 100.` }
    }

    if (!Number.isFinite(current)) {
      return { ok: false, problem: `${place} needs a current value, or 0 to start.` }
    }

    parsed.push({ current, name: row.name.trim(), target })
  }

  return { ok: true, rows: parsed }
}
