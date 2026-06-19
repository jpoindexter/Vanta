# CLAUDE.md — vanta-ts/src/settings

Settings layer for non-secret Vanta configuration.

- `store.ts`: Zod schema, three-scope merge, path helpers, env application, and display formatting.
- `store.test.ts`: schema acceptance, merge precedence, env application, and formatter coverage.
- `autoMode` config is consumed by `permissions/auto-mode.ts`; settings should not implement permission logic itself.
- `plugins.enabled` controls runtime plugin loading. Keep it non-secret and fail closed on malformed plugin config.
- `trust.ts` / `trust-gate.ts` / `trust-readline.ts`: VANTA-TRUST-DIALOG (+ VANTA-TRUST-LIGHTEN). Project-scoped trust store at `.vanta/trust.json` (`{version:1, project?, mcp?}`) — gate project context (CLAUDE.md/VANTA.md) loading and MCP-server mounting behind a one-time operator confirmation. `resolveProjectTrust`/`resolveMcpTrust` recall a stored decision, else ask via an injected `TrustConfirmer` and persist; **no confirmer (headless/non-TTY) → fail safe (untrusted, skipped)**. **Auto-trust lever:** pure `trustAuto(env, settings)` — `VANTA_TRUST_ALL` (truthy) **or** `settings.trust.auto` auto-trusts a project's context (persists `project=true`, no prompt); a persisted deny still wins, and **MCP trust is unaffected** (always prompts). **Lighter prompt:** the project dialog defaults to context-file `name (N lines)` summaries + a one-line `[y] trust · [n] don't · [v] view` ask (pure `fileSummary`/`lineCount`); `v` reveals the full previews. Pure store + gate + key-action helpers (`projectKeyAction`/`mcpKeyAction`) are unit-testable; the dialog is `ui/trust-dialog.tsx` (Ink) / `trust-readline.ts` (REPL fallback). Subagent/delegate mounts pass no confirmer and skip the gate (operator-session concern, not per-worker). This ADDS a gate; the kernel `assess()` still gates every mounted tool.

Keep the schema explicit. Unknown keys intentionally disappear so bad config cannot silently affect runtime behavior.
