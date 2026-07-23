# AGENTS.md — integrations

Provider adapters are external-data boundaries. Keep transport injectable and tests offline; never include credentials or remote content in durable receipts. Reads may return bounded context, while every write must obtain an explicit `ToolContext.requestApproval` before making a network request.

Keep files under the 200-line soft limit and functions under 50 lines. Provider API errors must be actionable but redact tokens, authorization headers, and query strings.
