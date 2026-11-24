import { describe, expect, it } from 'vitest'

import { formatBytes, outputFilesFromParts, outputKind } from './output-files'

const write = (path: string, result: unknown, extra: object = {}) => ({
  args: { content: 'x', path },
  result,
  toolName: 'write_file',
  type: 'tool-call',
  ...extra
})

describe('outputFilesFromParts', () => {
  it('returns a new file with its byte count', () => {
    const files = outputFilesFromParts([write('outputs/brief.md', 'wrote 1234 bytes to outputs/brief.md (new file)')])

    expect(files).toEqual([{ bytes: 1234, path: 'outputs/brief.md' }])
  })

  it('reads the result from an object payload too', () => {
    const files = outputFilesFromParts([write('a.md', { result_text: 'wrote 5 bytes to a.md (new file)' })])

    expect(files).toEqual([{ bytes: 5, path: 'a.md' }])
  })

  it('reads the metadata summary when the server sent no result', () => {
    const files = outputFilesFromParts([
      write('a.md', undefined, { toolResultMetadata: { summary: 'wrote 56 bytes to a.md (new file)' } })
    ])

    expect(files).toEqual([{ bytes: 56, path: 'a.md' }])
  })

  it('skips overwrites: those are edits, not outputs', () => {
    expect(outputFilesFromParts([write('a.md', 'wrote 5 bytes to a.md (overwritten)')])).toEqual([])
  })

  it('skips failed and denied writes', () => {
    expect(
      outputFilesFromParts([
        write('a.md', 'could not write a.md: EACCES'),
        write('b.md', 'wrote 5 bytes to b.md (new file)', { isError: true })
      ])
    ).toEqual([])
  })

  it('skips other tools and calls with no result yet', () => {
    expect(
      outputFilesFromParts([
        { args: { path: 'a.md' }, result: 'wrote 5 bytes to a.md (new file)', toolName: 'edit_file', type: 'tool-call' },
        write('b.md', undefined),
        { text: 'hi', type: 'text' }
      ])
    ).toEqual([])
  })

  it('de-duplicates by path and keeps only the last three', () => {
    const parts = ['a', 'b', 'c', 'd', 'a'].map(n => write(`${n}.md`, `wrote 1 bytes to ${n}.md (new file)`))

    expect(outputFilesFromParts(parts).map(f => f.path)).toEqual(['b.md', 'c.md', 'd.md'])
  })
})

describe('output labels', () => {
  it('names the kind by extension', () => {
    expect(outputKind('x/brief.md')).toBe('Markdown')
    expect(outputKind('page.HTML')).toBe('HTML')
    expect(outputKind('data.parquet')).toBe('PARQUET')
    expect(outputKind('Makefile')).toBe('File')
  })

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1229)).toBe('1.2 KB')
    expect(formatBytes(20480)).toBe('20 KB')
    expect(formatBytes(null)).toBe('')
  })
})
