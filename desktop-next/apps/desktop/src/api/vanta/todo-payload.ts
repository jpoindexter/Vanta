import { z } from 'zod'

/** One item in the shape the desktop's plan panel reads. */
export interface PlanItem {
  content: string
  id: string
  status: 'completed' | 'in_progress' | 'pending'
}

const argsSchema = z.object({
  action: z.literal('write'),
  items: z.array(z.object({ status: z.enum(['done', 'in_progress', 'pending']).optional(), text: z.string().min(1) }))
})

const STATUS: Record<'done' | 'in_progress' | 'pending', PlanItem['status']> = {
  done: 'completed',
  in_progress: 'in_progress',
  pending: 'pending'
}

/**
 * The Vanta `todo` tool writes `{action: 'write', items: [{text, status}]}`; the plan panel reads `todos: [{id, content,
 * status}]`. Returns the panel's shape for a write, and nothing for any other call, so only a real plan reaches the panel.
 */
export function planFromTodoArgs(name: string, args: unknown): PlanItem[] | null {
  if (name !== 'todo') {
    return null
  }

  const parsed = argsSchema.safeParse(args)

  return parsed.success
    ? parsed.data.items.map((item, index) => ({ content: item.text, id: String(index + 1), status: STATUS[item.status ?? 'pending'] }))
    : null
}

/**
 * Remembers the plan a `todo` write carried when it started, so the completed call can report it again with a revision.
 * A revision is what makes the plan durable: the desktop keeps it as the session's last plan after the turn ends.
 * The revision is the time of the write: it only has to grow, and it survives a new stream for the same session.
 */
export class PlanTracker {
  private readonly pending = new Map<string, PlanItem[]>()

  constructor(private readonly now: () => number = Date.now) {}

  start(id: string, name: string, args: unknown): void {
    const plan = planFromTodoArgs(name, args)

    if (plan) {
      this.pending.set(id, plan)
    }
  }

  complete(id: string): { revision: number; todos: PlanItem[] } | null {
    const todos = this.pending.get(id)
    this.pending.delete(id)

    return todos ? { revision: this.now(), todos } : null
  }

  reset(): void {
    this.pending.clear()
  }
}
