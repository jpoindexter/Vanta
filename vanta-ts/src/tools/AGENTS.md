# AGENTS.md — vanta-ts/src/tools

Built-in tool implementations. Register new tools in `index.ts` and `tools.test.ts`; every tool parses args at the LLM boundary and returns errors as values.

- `brain.ts` recall output is memory-guarded: fresh/sourced/non-conflicting entries are marked usable, while stale/conflicting/weak-provenance entries are flagged not used.
- Path tools must use scope helpers; safety descriptions must include risk-relevant target/command only, not content.
- Tool count is tracked in root/vanta-ts docs; update after registry changes.
