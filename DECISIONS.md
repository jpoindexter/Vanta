# DECISIONS — Argo

Append-only. Locked choices. Don't re-litigate without new info.

## 2026-06-02 — Git baseline before Phase 2
**Choice:** `git init` the repo and commit the Phase 1 baseline before any Phase 2 codegen.
**Why:** Argo had no git. An autonomous multi-file build needs a rollback floor, and the PRD's "git-versioned skills/memory" principle (#6) is meaningless without a repo.
**Reversible?** Yes (it only adds version control).

## 2026-06-02 — Search mirrors the provider pattern (Phase 2B)
**Choice:** `SearchProvider` is the same swap-by-env interface as `LLMProvider`. DDG keyless default; Searxng (self-host) = privacy recommendation; SerpAPI/Brave opt-in with keys. `web_search` resolves its provider lazily from `process.env` at call time.
**Alternatives:** Pass a SearchProvider through `ToolContext`/`buildRegistry`.
**Why:** Lazy resolution kept `buildRegistry()`/`ToolContext`/the agent loop unchanged — minimal blast radius. Mirrors an established, understood pattern.
**Reversible?** Yes (interface is swappable).

## 2026-06-02 — web-fetch deps: linkedom + @mozilla/readability (Phase 2B)
**Choice:** Use `@mozilla/readability` (PRD-specified) with `linkedom` as the lightweight DOM, reused for DDG HTML parsing.
**Alternatives:** jsdom (heavy), hand-rolled regex tag-stripper (fragile, fails "clean markdown").
**Why:** Readability is the quality bar; linkedom is far lighter than jsdom; one HTML lib serves both web-fetch and the DDG scraper. Both MIT, zero new vulnerabilities introduced.
**Reversible?** Yes (behind `extractReadable`).

## 2026-06-02 — DDG default is fragile by IP (Phase 2B)
**Choice:** Keep DDG as the keyless default per PRD, but document that `html.duckduckgo.com`/`lite.duckduckgo.com` 403 from datacenter/flagged IPs (verified live). Recommend Searxng/Brave off residential IPs.
**Why:** DDG actively blocks scrapers. The adapter is correct + unit-tested; the limit is environmental, not code. Not deviating from the PRD default, just honest about the constraint.
**Reversible?** Yes.

## 2026-06-02 — Skills & memory live in a global ~/.argo store (Phase 2A)
**Choice:** Skills (`~/.argo/skills/<slug>/SKILL.md`) and memories (`~/.argo/memories/<goalId>.md`) live in a user-global home store (override `ARGO_HOME`), NOT the per-project kernel `.argo/` data dir. The home is git-init'd for free versioning; writes best-effort `git commit`.
**Why:** PRD wants skills learned across projects and "git-versioned by default — no extra work." A global store + auto-commit delivers both. Per-project would silo learning.
**Reversible?** Yes (path resolver is one function).

## 2026-06-02 — Skill/memory writes are kernel-Allow via describeForSafety, not a bypass (Phase 2A)
**Choice:** `write_skill`/`recall` still go through the kernel `assess` gate (transparency + logging), but their `describeForSafety` returns a constant internal-op string ("record a learned skill in argo's memory" / "search argo's skill library") with NO project path and NO raw user content. The kernel classifies that as `Allow`, so the autonomous learning loop is not blocked by approval prompts.
**Alternatives:** (a) Bypass `assess` for these tools — rejected, weakens the boundary. (b) Include name/query in the description — rejected, user content can contain trigger words ("delete") that false-trigger `Block`.
**Why:** The safety-relevant view of writing Argo's own memory is "internal op, no user files touched" — consistent with the existing rule that `describeForSafety` sends only the risk-relevant part. The gate still runs and logs; nothing is bypassed.
**Reversible?** Yes. **Flagged for Jason's veto.**

## 2026-06-02 — Claude subscription OAuth is NOT viable for direct API use (v1 G closed)
**Choice:** Do NOT build subscription-OAuth login for Claude (ROADMAP G1). Stay on API keys for Anthropic.
**Why:** Primary-source evidence — Anthropic's **Messages API rejects OAuth subscription tokens** (`sk-ant-oat01-*`) with "OAuth authentication is currently not supported" (anthropics/claude-code#37205, badlogic/pi-mono#2751, June 2026). Those tokens only work *inside* Claude Code or through an LLM gateway/proxy — never the direct Messages API calls Argo makes. Building the PKCE flow Hermes uses would ship code that 401s at runtime. The supported path for programmatic Claude access is an API key (`ANTHROPIC_API_KEY`, already wired) — or, for subscription billing, routing through a proxy (out of v1 scope).
**Implications:** G2 (ChatGPT-Codex / Gemini-CLI OAuth) is similarly subscription-endpoint-gated and unverifiable here — deferred, not closed. "Hook to ChatGPT/Claude/Gemini" is satisfied via API keys + the `argo setup` wizard (shipped).
**Reversible?** Yes — revisit if/when Anthropic supports OAuth on the Messages API, or if Argo adds a gateway-proxy provider.

## 2026-06-02 — REVERSAL: Claude subscription via `claude-code` provider IS viable (grey area)
**New info:** Jason confirmed Hermes does this and it works; he was using it. The earlier "closed" decision had only half the story.
**Mechanism (why naive Bearer failed but this works):** the Messages API accepts a Claude Pro/Max OAuth token (`sk-ant-oat01-*`, from `~/.claude/.credentials.json` `claudeAiOauth.accessToken`) ONLY with all of: `Authorization: Bearer <token>`, `anthropic-beta: oauth-2025-04-20`, a `claude-code` User-Agent, and a system prompt that OPENS with the Claude Code identity line ("You are Claude Code, Anthropic's official CLI for Claude."). Missing any → 400/401. (Sources: code.claude.com/docs, gist changjonathanc/9f9d635…, NousResearch/hermes-agent#15080.)
**Choice:** Shipped `ARGO_PROVIDER=claude-code` (alias `claude-cli`) — `AnthropicProvider` OAuth mode + `providers/claude-code-auth.ts` reads the token (env or Claude Code creds), errors actionably if absent/expired. No token refresh in v1 (Claude Code keeps the file fresh; expired → "run `claude` to refresh").
**Grey area / honesty:** Using a subscription token for programmatic access is against Anthropic's ToS (it's meant for Claude Code interactive use). Argo exposes it because the user explicitly asked; the user runs it under their own judgment. Argo's automation harness BLOCKS the assistant from executing it (credential-repurposing) — so it's user-run only, not agent-run. API keys remain the clean/supported path.
**Reversible?** Yes — it's one provider case; remove if ToS enforcement changes.
