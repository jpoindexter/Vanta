# PARKED — Argo

Deferred ideas. Promote, never delete. These are honest deferrals — the code that exists is real and tested; these are the bits that need external setup or are post-MVP polish.

## Live-use setup (code is built + offline-tested; these unlock live use)
- **Comms OAuth client** — `argo auth google` needs a one-time Google Cloud OAuth client (`ARGO_GOOGLE_CLIENT_ID/SECRET`). Truly zero-config "bundled client" needs Argo registered as a published OAuth app (publisher step). Captured 2026-06-02. Cost to revisit: ~30 min in Google Cloud Console + set 2 env vars.
- **Browser binaries** — browser tools need `npx playwright install chromium` (playwright-core ships no binaries). Tools degrade gracefully with a clear message until then.
- **API keys** — Anthropic provider (`ANTHROPIC_API_KEY`) and `describe_image` vision (`OPENAI_API_KEY`) need keys for live use.

## Hardening / fidelity
- **OAuth PKCE** — `google/auth.ts` uses the confidential-client loopback flow (client secret). PKCE (S256) is ~4 lines of additional hardening. Captured 2026-06-02.
- **Anthropic adjacent tool_result merge** — `toAnthropicMessages` emits consecutive tool results one-per-message; the API enforces role alternation, so merging adjacent `tool_result` blocks may be needed for multi-tool turns. Flagged by the builder.
- **vitest 4 upgrade** — devDependency esbuild advisory (dev-server only, never shipped). `npm audit fix --force` → vitest 4 (breaking). Pre-existing from Phase 1.

## Scope-limited v0 implementations (real, bounded)
- **LSP = .ts/.tsx only** — `lsp_diagnostics`/`lsp_definition` use the TS compiler API. Other languages (rust-analyzer, pyright) are future.
- **A2A = local in-process** — `A2ABus` routes between in-process agents. Networked Google-A2A transport is future (the message shape is forward-compatible).
- **Non-streaming providers** — the loop waits for full tool calls; streaming fits behind `LLMProvider` later (locked decision, Phase 1).
- **Claude subscription OAuth** — PRD Phase 5 mentioned OAuth for Claude Pro/Max (no API key). Not built; Anthropic is API-key only for now.
- **`argo cron` needs an OS trigger** — the scheduler logic (`isDue`/`runDueTasks`) is real + tested; full autonomy needs hooking `argo cron` to launchd/cron to fire every minute.

## Polish (post-users)
- Streaming live output, richer cockpit UI, multi-language run-code sandboxing, project-room goal namespacing beyond per-dir `.argo`.
