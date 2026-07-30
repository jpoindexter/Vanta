---
name: agent-interface-design
description: Design or review tools, MCP servers, functions, and scripts intended for use by AI agents. Use when a tool needs long usage examples, agents call it incorrectly, parameters are ambiguous, results are unstructured, status transitions are implicit, or tool instructions duplicate the system prompt. Replace tutorial prose with precise schemas, bounded enums, clear authority, structured failures, and testable examples at the interface boundary.
---

# Agent Interface Design

Make the interface teach the behavior. A capable agent should infer the valid
operation from names, types, constraints, and return values without carrying a
tutorial in every prompt.

## Review

1. Identify the task-shaped operation and its authority boundary.
2. Inspect the real schema and implementation, not only documentation.
3. Apply the checklist in
   [interface-checklist.md](references/interface-checklist.md).
4. Replace ambiguous strings and booleans with explicit enums or tagged unions.
5. Return failures as typed values with a recovery path. Reserve thrown errors
   for broken invariants or transport failures.
6. Keep the tool description to purpose, preconditions, side effects, and the
   essential safety boundary. Remove examples that merely restate the schema.
7. Add contract tests for valid, invalid, unavailable, denied, and interrupted
   cases.

## Required output

- Interface before/after or a proposed schema.
- Removed prompt text and where its meaning now lives.
- Authority and side-effect classification.
- Failure taxonomy and recovery behavior.
- Tests executed and the user-visible path they do not establish.
