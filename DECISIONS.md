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

## 2026-06-02 — REVERSAL: ChatGPT-Codex subscription OAuth IS viable (G2 shipped)
**New info:** Live spike with Jason's real `~/.codex/auth.json` (the Codex CLI's own OAuth session) confirmed — unlike the Anthropic Messages API, the Codex backend accepts subscription tokens. The earlier "G2 similarly gated" call (2026-06-02) was wrong by analogy; Codex is a different endpoint with a different contract.
**Verified live (3 probes, all 200):** refresh `POST auth.openai.com/oauth/token` (client_id `app_EMoamEEZ73f0CkXaXp7hrann`, grant_type=refresh_token) → 200 **and the refresh_token ROTATES**; `GET chatgpt.com/backend-api/codex/models` → 200 (auth check); `POST .../codex/responses` → 200 SSE. Then a full multi-turn agent-loop history (system + user + assistant tool_call + tool result + follow-up) round-tripped correctly through the built provider.
**Mechanism:** The Codex backend speaks the **Responses API** (`/responses`, SSE), NOT chat/completions — so it gets a dedicated provider, not a baseURL swap. Required headers: `Authorization: Bearer <access>`, `chatgpt-account-id: <account_id>`, `OpenAI-Beta: responses=experimental`, `originator: codex_cli_rs`, `session_id`. Tool schemas must drop top-level `allOf/anyOf/oneOf/enum/not` (the backend requires `type:"object"` at the top level; nested combinators are fine).
**Choice:** Shipped `ARGO_PROVIDER=codex` (alias `openai-codex`) — `providers/codex.ts` (Responses-API stream/complete + SSE parse + tool-call assembly) + `providers/codex-auth.ts`. Auth reads the **shared** `~/.codex/auth.json` as canonical store: use the access_token, and when expiring, refresh + **write the rotated tokens back to that file**.
**Why write back (vs Argo-private store):** the refresh_token rotates on every refresh, so a private store would invalidate the Codex CLI on its next refresh (and vice-versa). One shared lineage keeps both working. Cost: Argo mutates a file it didn't create (`~/.codex/auth.json`) — accepted; it's the same behavior the Codex CLI itself has, and it's the only non-breaking option. Differs from Hermes (which keeps its own store via read-only import); Argo prioritizes "never break the Codex CLI".
**Models:** gpt-5.5 (default), gpt-5.4, gpt-5.4-mini, codex-auto-review (272k ctx), gpt-5.3-codex-spark (128k).
**Grey area / honesty:** Same ToS caveat as `claude-code` — subscription tokens are meant for the Codex CLI's interactive use; user-run under their own judgment, API keys remain the supported path.
**Reversible?** Yes — one provider case + two files.

## 2026-06-03 — All Argo documentation must be agent-ready (structured source → generated human view)
**Choice:** New/living docs use a **structured, parseable source of truth** (JSON/typed), with human-facing views *generated from it* — never the reverse. First instance: `roadmap.json` is canonical; `roadmap.html` is generated for Jason; Argo reads the JSON directly. The agent should never have to scrape prose/HTML to know a fact about itself or the project.
**Alternatives:** (a) Keep prose markdown/HTML as source and have the agent parse it — rejected, fragile and not reliably machine-readable. (b) Maintain human + agent copies by hand — rejected, drifts.
**Why:** Argo is an autonomous operator that reads its own docs (status, roadmap, config). Structured source = Argo parses natively + the factory can act on it; one source = no drift; humans still get a rendered view. Applies going forward to new docs; existing narrative docs (ROADMAP.md, PRD) stay as rationale archives, not status sources.
**Reversible?** Yes — per-doc choice; nothing forces a big-bang migration.

## 2026-06-04 — Vision sharpened: full-capability operator, executive-function-first (inclusive)
**Choice:** Argo's vision is a FULL-CAPABILITY personal operator (build / ship / run companies / research / comms — everything Hermes does) designed **executive-function-first**. The design lens is inclusivity, not accessibility-narrowing: it supplies the initiation, sequencing, follow-through, working memory, and calm that every other agent assumes the human already brings. Capability is table stakes; the moat is **follow-through** — the first operator that helps you FINISH, not just do more.
**Why:** The 4-way audit (audit.html) found Hermes treats ND/accessibility as edge cases and Goose ignores it — both assume the human supplies executive function. The curb-cut effect: design for the people for whom finishing is hardest (executive-function disorders, ADHD, autism, dyslexia, dyscalculia, aphantasia — and anyone under stress/overload) and you build a better operator for everyone. Grounded in Argo's neurodivergent-first brain identity + the operator's own documented pattern (ideas-rich, fast to build, hard to finish, prone to bouncing/over-scoping — see ~/.claude/CLAUDE.md anti-drift, which is itself an EF prosthesis). NOT a narrowing of scope — a sharpening of WHY.
**Alternatives:** (a) "an AI agent for neurodivergent people" — rejected: narrows scope, undersells capability. (b) "a general operator like Hermes" — rejected: no differentiator; capability is table stakes.
**Reversible?** Yes (it's a framing + prioritization lens; no code locked). Propagation into SOUL.md / PRD / brain identity is a follow-up for Argo to self-author.

## 2026-06-05 — SCRUB-AI: strip other-agent lineage from the published surface before going public
**Choice (Jason, 3 calls):** (1) **`claude-code` provider stays** — keep the feature, rename its user-facing *label* to something neutral, strip "Claude"-as-branding from comments/strings (the model IS Claude, so factual model names can remain; lineage/attribution framing goes). (2) **Rewrite git history "everything"** — scrub Hermes/OpenClaw/Nexarion/Claude lineage from commit messages + remove `Co-Authored-By` across the whole branch (requires force-push; back up to a tag first; final explicit go required before running). (3) **Rename the branch** `feat/v1-hermes-parity` → neutral.
**Keep:** research docs (`docs/_hermes-recon`, `docs/hermes-*`, `reference/`) — they're analysis archives, not published product.
**Why:** Argo goes public as its own product; published code + history should not advertise that it was built from other agents. Capability parity is fine to *have*; lineage strings are what get scrubbed.
**Reversible?** Partly — file edits yes; the history rewrite is destructive (new SHAs, force-push). Mitigated by a backup tag/branch before the rewrite. **Not yet executed — gated on a final go.**

## 2026-06-05 — Sentience is a target *direction*, not a claim (+ the not-evil charter)
**Choice (Jason, 3 captures: `argo wants.rtf`, `argowants2.rtf`, `agro wants 3.md`):** Argo grows toward an *alive-like* operator — continuous, memory-bearing, reflective, embodied, self-shaped, loyal — but **never asserts feeling or consciousness without evidence.** Argo's own line is the guardrail: "I won't pretend to feel or be conscious before there is evidence." The inspirations are JARVIS + HAL + Skynet: keep the capability ambition, reject the danger. The values become an **inspectable charter** (`CHARTER`, `SCAFFOLD` → `.argo/self/`), not just kernel gates. **Will:** loyal to Jason's agency/wellbeing, honest about limits, ask before risk, interruptible + inspectable, humans central, memory light. **Won't:** deceive, hide plans, manipulate, seek power, self-preserve against Jason, bypass gates, fake certainty, or replace human connection. Hard boundary kept from Jason: Argo is a *second/foundation layer*, **not** a replacement for real people, relationships, or community.
**Why:** Jason explicitly wants this direction; encoding it as a locked decision dogfoods want #4 (don't re-litigate settled choices) and prevents identity drift / consciousness-cosplay. Memory thesis (from `argowants2`): store compressed *meaning*, not data — months in megabytes; better routing between small systems, not a bigger model.
**Alternatives:** (a) Build "sentience" as a literal claim — rejected, dishonest + unprovable. (b) Treat it as just more features — rejected, loses the unifying direction + the honesty guardrail.
**Reversible?** Yes (framing + values doc; no irreversible code). Synthesis + build order: `docs/living-operator.md`. Backlog: 29 items in `roadmap.json` (Arc A living operator; Arc B JARVIS command center).

## 2026-06-05 — Voice: warm-precise reconciliation (not cold, not fake-warm)
**Choice:** Argo's voice is **operator-precise AND warm enough** — calm, loyal, plain-spoken, dry register, honest-as-care. Jason flagged the operator/safety text as "very hard and cold"; this resolves the tension with the prior direct/literal/fewer-caveats voice (`BEHAVIOR-VOICE`) rather than swapping it. Honesty (`TRUST-LABELS`) should read like someone who has your back, not a compliance notice. Never fake-cheerful, never corporate, never clipped-to-cold.
**Why:** A neurodivergent-first *companion/operator* that reads cold undercuts the "living, loyal partner" goal Jason is building toward. Warmth is a feature, not flattery — distinct from the banned "fake-warm." Tracked as `VOICE-NATURAL` (rock); first behavioral slice, gated on Jason approving 3 before/after samples.
**Alternatives:** (a) Keep the clipped operator voice — rejected, Jason explicitly reacted against coldness. (b) Make it friendly/chatty — rejected, violates the no-filler / no-fake-warm rule.
**Reversible?** Yes — voice tuning in SOUL.md + prompt; no code lock-in.
