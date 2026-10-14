import { describe, expect, it } from 'vitest'

import { parseErrorSurface } from './error-surface'
import { checkpointPrompt } from './run-recovery'

describe('checkpointPrompt', () => {
  it('carries the original request and the saved partial output so finished work is not repeated', () => {
    const text = checkpointPrompt({ actions: [], checkpoint: { instruction: 'tidy the repo', partialText: ' Renamed a.ts ' } })

    expect(text).toBe('Continue from this checkpoint and avoid repeating completed work. Original request: tidy the repo\n\nSaved partial output:\nRenamed a.ts')
  })

  it('works without partial output, and without a saved request', () => {
    expect(checkpointPrompt({ actions: [], checkpoint: { instruction: 'tidy the repo' } })).toBe('Continue from this checkpoint. Original request: tidy the repo')
    expect(checkpointPrompt({ actions: [] })).toContain('Continue from the saved checkpoint.')
  })
})

describe('parseErrorSurface recovery', () => {
  const base = { code: 'repeated_failure', layer: 'runtime' }

  it('keeps the known actions and the checkpoint', () => {
    const surface = parseErrorSurface({
      ...base,
      recovery: { actions: ['edit_request', 'bogus', 'start_from_checkpoint'], checkpoint: { instruction: 'x', partialText: 'y' } }
    })

    expect(surface?.recovery).toEqual({ actions: ['edit_request', 'start_from_checkpoint'], checkpoint: { instruction: 'x', partialText: 'y' } })
  })

  it('has no recovery when the producer sent none, and survives a garbled one', () => {
    expect(parseErrorSurface(base)).not.toHaveProperty('recovery')
    expect(parseErrorSurface({ ...base, recovery: 'oops' })).not.toHaveProperty('recovery')
  })
})
