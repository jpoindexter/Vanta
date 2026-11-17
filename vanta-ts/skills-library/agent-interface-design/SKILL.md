---
name: agent-interface-design
description: Design or review Vanta tools, MCP servers, functions, and scripts when agents call them incorrectly, parameters are ambiguous, results are unstructured, status transitions are implicit, or long usage examples repeat the system prompt. Replace tutorial prose with precise schemas, bounded enums, clear authority, structured failures, and contract tests.
created: 2026-07-29
updated: 2026-07-29
---

# Agent Interface Design

Make the interface teach the behavior. A capable model should infer the valid
operation from names, types, constraints, and return values.

## Review

1. Identify the task-shaped operation and authority boundary.
2. Inspect the real schema and implementation, not only its documentation.
3. Replace ambiguous strings and booleans with explicit enums or tagged unions.
4. Distinguish omitted, unknown, empty, and false.
5. Declare scope, side effects, idempotency, approval needs, timeouts, and limits.
6. Return structured success, denial, unavailable, interrupted, and failure
   values. Reserve throws for broken invariants or transports.
7. Remove examples that merely restate the schema. Keep descriptions to purpose,
   preconditions, side effects, and essential safety boundaries.
8. Test valid, invalid, unavailable, denied, and interrupted cases through the
   agent-facing path.

Report the before/after interface, removed prompt text, failure taxonomy, tests,
and what the executed evidence does not establish.
