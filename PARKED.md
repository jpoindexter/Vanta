# PARKED — Vanta

Deferred ideas. Promote, never delete. These are honest deferrals — the code that exists is real and tested; these are the bits that need external setup or are post-MVP polish.

## Promoted into v1 (2026-06-02 — now in `ROADMAP.md`, no longer parked)
- **Claude subscription OAuth** → ROADMAP **G1** (was "Scope-limited v0" below).
- **`argo cron` OS trigger** → subsumed by ROADMAP **E1** (daemon/service mode runs an in-process cron tick; launchd backend).
- **A2A networked transport** → ROADMAP **E6** (ACP server — Hermes has no peer-to-peer A2A; ACP is the real interop path).
- Plus net-new v1 scope from the Hermes recon: Gemini/OpenRouter providers + provider registry + `argo setup` wizard + `status`/`doctor` (A), the self-improvement loop wiring (B), session persist/resume (C), skill-library port (D), messaging gateway (E2). See `ROADMAP.md`.

## Newly parked — out of v1 scope (from the Hermes recon)
- **The ~24 niche model providers** beyond OpenAI/Anthropic/Ollama/Gemini/OpenRouter (Bedrock, DeepSeek, xAI, Qwen, Kimi, Z.AI, Copilot, MiniMax, Nous, …). The provider *registry* (A2) makes each a small add later; not v1 work.
- **The other ~19 messaging platforms** beyond Telegram (Discord, Slack, Signal, WhatsApp, Matrix, iMessage, the China stack, …). v1 ships Telegram only to prove the `BaseAdapter` pattern (Rule of 3).
- **Image-gen / voice-transcription providers** (DALL-E/Whisper registries) — not on the operator path.
- **Multi-credential failover pool** (`credential_pool.py` — round-robin/least-used across many keys). Single-user, single-key; no need.
- **Trajectory / datagen pipeline** (`batch_runner` → ShareGPT JSONL → fine-tuning). It's a *training-data* pipeline, not the runtime self-improvement loop; only relevant if Vanta ever fine-tunes a model.

## Live-use setup (code is built + offline-tested; these unlock live use)
- **Comms OAuth client** — `argo auth google` needs a one-time Google Cloud OAuth client (`VANTA_GOOGLE_CLIENT_ID/SECRET`). Truly zero-config "bundled client" needs Vanta registered as a published OAuth app (publisher step). Captured 2026-06-02. Cost to revisit: ~30 min in Google Cloud Console + set 2 env vars.
- **Browser binaries** — browser tools need `npx playwright install chromium` (playwright-core ships no binaries). Tools degrade gracefully with a clear message until then.
- **API keys** — Anthropic provider (`ANTHROPIC_API_KEY`) and `describe_image` vision (`OPENAI_API_KEY`) need keys for live use.

## Hardening / fidelity
- **OAuth PKCE** — `google/auth.ts` uses the confidential-client loopback flow (client secret). PKCE (S256) is ~4 lines of additional hardening. Captured 2026-06-02.
- **Anthropic adjacent tool_result merge** — `toAnthropicMessages` emits consecutive tool results one-per-message; the API enforces role alternation, so merging adjacent `tool_result` blocks may be needed for multi-tool turns. Flagged by the builder.
- **vitest 4 upgrade** — devDependency esbuild advisory (dev-server only, never shipped). `npm audit fix --force` → vitest 4 (breaking). Pre-existing from Phase 1.

## Scope-limited v0 implementations (real, bounded)
- **LSP = .ts/.tsx only** — `lsp_diagnostics`/`lsp_definition` use the TS compiler API. Other languages (rust-analyzer, pyright) are future.
- **A2A = local in-process** — `A2ABus` routes between in-process agents. Networked interop = ACP server (promoted → ROADMAP E6).
- **Non-streaming providers** — the loop waits for full tool calls; streaming fits behind `LLMProvider` later (locked decision, Phase 1).

## Polish (post-users)
- Streaming live output, richer cockpit UI, multi-language run-code sandboxing, project-room goal namespacing beyond per-dir `.argo`.
