/**
 * Output cards: the files the agent made in a turn. Source of truth is the
 * `write_file` tool result ("wrote N bytes to <path> (new file)"), not the
 * assistant's prose, so a file shows up whether or not the model mentions it.
 * Overwrites are edits, not new outputs; they already show as diffs.
 */
import { firstStringField } from '@/lib/text'

export interface OutputFile {
  bytes: number | null
  path: string
}

interface ToolPartLike {
  args?: unknown
  isError?: boolean
  result?: unknown
  text?: string
  toolName?: string
  toolResultMetadata?: { summary?: unknown }
  type: string
}

const WRITE_TOOL = 'write_file'
const NEW_FILE_RE = /^wrote (\d+) bytes to (.+?) \(new file\)/
const MAX_OUTPUT_CARDS = 3

function resultText(result: unknown): string {
  if (typeof result === 'string') {
    return result
  }

  if (result && typeof result === 'object') {
    return firstStringField(result as Record<string, unknown>, ['result_text', 'output', 'summary', 'message']) ?? ''
  }

  return ''
}

export function outputFilesFromParts(parts: readonly ToolPartLike[]): OutputFile[] {
  const seen = new Set<string>()
  const files: OutputFile[] = []

  for (const part of parts) {
    if (part.type !== 'tool-call' || part.toolName !== WRITE_TOOL || part.isError) {
      continue
    }

    // Vanta's server sends the output as `result_text`, which the stream stores as the metadata
    // summary (first line of the output); Vanta-shaped payloads carry `result` instead.
    const summary = part.toolResultMetadata?.summary
    const text = resultText(part.result) || (typeof summary === 'string' ? summary : '')
    const match = NEW_FILE_RE.exec(text.trim())
    const argPath = part.args && typeof part.args === 'object' ? (part.args as { path?: unknown }).path : undefined
    const path = typeof argPath === 'string' && argPath ? argPath : match?.[2]

    if (!match || !path || seen.has(path)) {
      continue
    }

    seen.add(path)
    files.push({ bytes: Number(match[1]), path })
  }

  return files.slice(-MAX_OUTPUT_CARDS)
}

const KIND_BY_EXT: Record<string, string> = {
  csv: 'CSV',
  html: 'HTML',
  json: 'JSON',
  md: 'Markdown',
  markdown: 'Markdown',
  pdf: 'PDF',
  png: 'Image',
  jpg: 'Image',
  jpeg: 'Image',
  svg: 'Image',
  txt: 'Text'
}

export function outputKind(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? ''
  const ext = name.includes('.') ? (name.split('.').pop()?.toLowerCase() ?? '') : ''

  return KIND_BY_EXT[ext] ?? (ext ? ext.toUpperCase() : 'File')
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) {
    return ''
  }

  if (bytes < 1024) {
    return `${bytes} B`
  }

  return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
}
