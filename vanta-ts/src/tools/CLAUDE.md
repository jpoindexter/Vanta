# CLAUDE.md — vanta-ts/src/tools

Tool layer. Tools are the execution boundary below the agent loop and above the Rust safety kernel.

- Add tool: new `tools/<name>.ts`, zod `safeParse`, scoped paths, `describeForSafety`, register in `index.ts`, update `tools.test.ts`.
- `brain.ts`: read/write/list/remember/recall for `~/.vanta/brain`; recall uses `memory/guardrails.ts` before returning entries to the model.
- Keep outputs actionably small; compression/offload happens later in `agent/dispatch-tool.ts`.

Invariant: never weaken kernel `block`; tool-internal checks may only tighten or explain failures.
