# CLAUDE.md — workflow

Declarative workflow graph layer for FABRO-style agent pipelines.

## Shape

- Nodes: `agent`, `approval`, `interview`.
- Transitions: `next`, `branch`, `loop`, `parallel`.
- Graph specs are plain JSON and validate through `WorkflowGraphSchema`.
- Diffs use canonical graph JSON so authoring order changes do not create noisy diffs.

## Boundary

This folder is pure orchestration logic. It must not resolve providers, build tool registries, spawn real subagents, read files, or call the kernel directly. Inject those as dependencies through `runWorkflowGraph`.

Each executed node is expected to route through `assess()` before doing work. Human gates use `requestApproval()` and return `paused` when denied.
