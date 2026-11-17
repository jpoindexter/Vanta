import { describe, expect, it } from 'vitest'

import { createFrameMapper } from './event-mapper'
import { PlanTracker, planFromTodoArgs } from './todo-payload'

describe('planFromTodoArgs', () => {
  it('turns a todo write into the plan panel shape, with done as completed', () => {
    expect(
      planFromTodoArgs('todo', {
        action: 'write',
        items: [{ status: 'done', text: 'Read the snapshot' }, { status: 'in_progress', text: 'Diff the two' }, { text: 'Draft the brief' }]
      })
    ).toEqual([
      { content: 'Read the snapshot', id: '1', status: 'completed' },
      { content: 'Diff the two', id: '2', status: 'in_progress' },
      { content: 'Draft the brief', id: '3', status: 'pending' }
    ])
  })

  it('ignores a list call, another tool, and malformed args', () => {
    expect(planFromTodoArgs('todo', { action: 'list' })).toBeNull()
    expect(planFromTodoArgs('read_file', { action: 'write', items: [] })).toBeNull()
    expect(planFromTodoArgs('todo', { action: 'write', items: [{ status: 'later', text: 'x' }] })).toBeNull()
  })
})

describe('tool.start for a plan', () => {
  it('carries todos so the plan panel shows the plan', () => {
    const out = createFrameMapper().map({
      kind: 'tool_start',
      label: '→ todo',
      name: 'todo',
      typed: { args: { action: 'write', items: [{ status: 'in_progress', text: 'Diff the two' }] }, id: 't1', name: 'todo', type: 'tool.start' }
    })

    expect(JSON.stringify(out)).toContain('"todos":[{"content":"Diff the two","id":"1","status":"in_progress"}]')
  })

  it('adds no todos to an ordinary tool', () => {
    const out = createFrameMapper().map({
      kind: 'tool_start',
      label: '→ read_file',
      name: 'read_file',
      typed: { args: { path: 'a.md' }, id: 't2', name: 'read_file', type: 'tool.start' }
    })

    expect(JSON.stringify(out)).not.toContain('todos')
  })
})

describe('tool.complete for a plan', () => {
  it('repeats the plan with a growing revision so the desktop keeps it after the turn', () => {
    const mapper = createFrameMapper()
    const args = { action: 'write', items: [{ status: 'done', text: 'Read the snapshot' }, { text: 'Draft the brief' }] }

    mapper.map({ kind: 'tool_start', name: 'todo', typed: { args, id: 't1', name: 'todo', type: 'tool.start' } })
    const out = mapper.map({ kind: 'tool_end', name: 'todo', typed: { id: 't1', name: 'todo', ok: true, output: 'plan updated', type: 'tool.complete' } })
    const text = JSON.stringify(out)

    expect(text).toContain('"todos":[{"content":"Read the snapshot","id":"1","status":"completed"},{"content":"Draft the brief","id":"2","status":"pending"}]')
    expect(text).toMatch(/"revision":\d+/)
  })

  it('adds nothing for a completed call that was not a plan', () => {
    const mapper = createFrameMapper()
    mapper.map({ kind: 'tool_start', name: 'read_file', typed: { args: { path: 'a' }, id: 't2', name: 'read_file', type: 'tool.start' } })
    const out = mapper.map({ kind: 'tool_end', name: 'read_file', typed: { id: 't2', name: 'read_file', ok: true, output: 'ok', type: 'tool.complete' } })

    expect(JSON.stringify(out)).not.toContain('revision')
  })
})

describe('PlanTracker', () => {
  it('gives each write its own time-based revision and forgets a plan once reported', () => {
    let clock = 1000
    const tracker = new PlanTracker(() => clock)
    const args = { action: 'write', items: [{ text: 'a' }] }

    tracker.start('x', 'todo', args)
    expect(tracker.complete('x')?.revision).toBe(1000)
    expect(tracker.complete('x')).toBeNull()

    clock = 2000
    tracker.start('y', 'todo', args)
    expect(tracker.complete('y')?.revision).toBe(2000)
  })
})
