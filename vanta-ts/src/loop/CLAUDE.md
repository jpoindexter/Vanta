# CLAUDE.md — vanta-ts/src/loop

Loop internals are intentionally small and durable:

- Definition file: `.vanta/loops/<id>.json`
- State file: `.vanta/loops/<id>.state.json`
- Wake queue: `.vanta/loops/wake-events.jsonl`

Wake context must stay compact: include `wake_reason`, `goal_id`, optional `approval_id`, `since`, and a short `delta[]`. Do not inject full loop history into prompts.

Approval-like loop unblock is represented by clearing an escalation, which enqueues an `approval.resolved` wake for the owning loop. Keep that path operator-only.
