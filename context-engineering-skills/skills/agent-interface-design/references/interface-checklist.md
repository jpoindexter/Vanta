# Agent interface checklist

- Name the operation as a verb with one clear outcome.
- Use task-shaped parameters; avoid raw shell fragments when a typed field works.
- Encode state machines as enums or tagged unions.
- Distinguish omitted, unknown, empty, and false.
- Declare scope, side effects, idempotency, and approval requirements.
- Constrain paths, URLs, identifiers, counts, timeouts, and payload sizes.
- Return structured success, denial, unavailable, interrupted, and failure values.
- Include a stable receipt or correlation ID for consequential actions.
- Keep descriptions concise; do not repeat parameter documentation.
- Expose the tool only when prerequisites are available.
- Test invalid combinations and recovery, not only the happy path.
- Verify the real agent-facing path; a schema unit test does not prove runtime use.
