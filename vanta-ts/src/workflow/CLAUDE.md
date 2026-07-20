# CLAUDE.md — workflow

Declarative workflow graph layer for FABRO-style agent pipelines.

## Shape

- Nodes: `trigger`, `action`, `browser`, `agent`, `approval`, `interview`.
- Transitions: `next`, `branch`, `loop`, `parallel`.
- Graph specs are plain JSON and validate through `WorkflowGraphSchema`.
- Graph specs can declare `revision`, a versioned typed `state.fields` map, and each node's `state.read` / `state.write` allowlist.
- Diffs use canonical graph JSON so authoring order changes do not create noisy diffs.
- Runs with a stable `run_id` persist atomically under `.vanta/workflow-runs/` and resume confirmed nodes after restart.
- Parsed graphs materialize typed success, failure, pause, exhausted, cancelled, recovery, and budget contracts.
- Saved composer revisions live under `.vanta/workflows/<workflow-id>/`; revisions are immutable and `current.json` points to the latest accepted revision.

## Boundary

This folder is pure orchestration logic. It must not resolve providers, build tool registries, spawn real subagents, read files, or call the kernel directly. Inject those as dependencies through `runWorkflowGraph`.

Each executed node is expected to route through `assess()` before doing work. Human gates use `requestApproval()` and return `paused` when denied.

Parallel state commits merge only when their fields are disjoint. A stale same-field write is rejected as `GraphRunConflictError`. State-writing workers use the JSON envelope assembled in `agent-outcome.ts`; secret material stays behind opaque references.

Completion checks use persisted evidence, node status, typed state, and approvals. Agent output text cannot satisfy an evidence check. Step, wall-clock, token, cost, no-progress, and cancellation stops persist a terminal receipt; exhausted and cancelled runs do not replay on reopen.

## Composer

`compose_workflow` supports `save`, `open`, `list`, `diff`, and `launch`. Saved graphs require one trigger at `start`, typed node ports, connected nodes, explicit action/browser side-effect and approval declarations, and bounded feedback loops with terminal escalation. Launch resolves existing tools through the registry, assesses each executable node through the kernel, and reuses durable workflow receipts and pause/resume behavior.

Typed `bindings` resolve a consumer input from a prior node output. Preflight rejects missing, reversed, cyclic, out-of-order, incompatible, and secret-exposing references. Runtime reads persisted outputs, records source/type/redaction without the value, and supplies the resolved argument to both kernel assessment and execution.
