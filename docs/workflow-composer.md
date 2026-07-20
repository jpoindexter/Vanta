# Workflow composer

Updated 2026-07-20.

Vanta composes its existing trigger, tool, browser, agent, approval, state, and receipt primitives. It does not embed a second automation runtime or a generic n8n clone.

## Operator contract

Use the `compose_workflow` tool with one of five modes:

- `save` validates and stores an immutable workflow revision.
- `open` returns the canonical saved graph.
- `list` returns the current revision of each project workflow.
- `diff` compares a stored revision with the current or selected revision.
- `launch` runs a saved revision through the existing workflow executor, safety kernel, approval boundary, and receipt store.

Project workflows live under `.vanta/workflows/<workflow-id>/`. A revision cannot be overwritten with different content, and a new revision must advance beyond the current revision.

## Authoring rules

A saved workflow must have:

1. Exactly one trigger, used as the graph start.
2. A connected graph with typed input and output ports on every node.
3. Explicit side-effect and approval declarations for action and browser nodes.
4. Browser tools whose names use the `browser_` boundary.
5. A hard iteration cap and terminal `onExhausted` escalation for every feedback loop.
6. A positive revision and a completion contract materialized by the graph parser.

Action and browser nodes resolve existing Vanta tools. Their exact tool and arguments are assessed by the safety kernel before execution. `approval: always` adds an explicit human gate even when the kernel permits the action.

## Typed handoffs

A consumer node maps an input port to a prior output with `bindings`:

```json
{
  "io": { "inputs": { "path": "string" }, "outputs": { "content": "string" } },
  "bindings": { "path": { "node": "request", "output": "path" } }
}
```

Preflight rejects missing ports or nodes, reversed and cyclic references, disconnected or out-of-order producers, incompatible types, and any attempt to coerce a `secret-ref` into a non-secret input. Runtime resolves the same binding from the persisted producer receipt. Tool bindings override static args and the resolved arguments are included in kernel assessment.

Node receipts preserve typed outputs and a handoff ledger containing the input, producer, output, type, and redaction flag. Secret values remain opaque `{ "secretRef": "..." }` references; handoff receipts never contain the value or reference identifier.

## Recovery and truth

A stable `run_id` resumes durable state under `.vanta/workflow-runs/`. Confirmed work is not replayed after a pause. A denied approval persists `paused`; the operator must explicitly resume it. A loop that reaches its cap runs its escalation node and persists `exhausted`, never success.

Completion depends on persisted node, state, approval, artifact, rubric, test, and receipt evidence. Agent prose is not proof.
