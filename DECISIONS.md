# DECISIONS — Vanta

Append-only. Locked choices. Don't re-litigate without new info.

## 2026-06-02 — Git baseline before Phase 2
**Choice:** `git init` the repo and commit the Phase 1 baseline before any Phase 2 codegen.
**Why:** Vanta had no git. An autonomous multi-file build needs a rollback floor, and the PRD's "git-versioned skills/memory" principle (#6) is meaningless without a repo.
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

## 2026-06-02 — Skills & memory live in a global ~/.vanta store (Phase 2A)
**Choice:** Skills (`~/.vanta/skills/<slug>/SKILL.md`) and memories (`~/.vanta/memories/<goalId>.md`) live in a user-global home store (override `VANTA_HOME`), NOT the per-project kernel `.vanta/` data dir. The home is git-init'd for free versioning; writes best-effort `git commit`.
**Why:** PRD wants skills learned across projects and "git-versioned by default — no extra work." A global store + auto-commit delivers both. Per-project would silo learning.
**Reversible?** Yes (path resolver is one function).

## 2026-06-02 — Skill/memory writes are kernel-Allow via describeForSafety, not a bypass (Phase 2A)
**Choice:** `write_skill`/`recall` still go through the kernel `assess` gate (transparency + logging), but their `describeForSafety` returns a constant internal-op string ("record a learned skill in vanta's memory" / "search vanta's skill library") with NO project path and NO raw user content. The kernel classifies that as `Allow`, so the autonomous learning loop is not blocked by approval prompts.
**Alternatives:** (a) Bypass `assess` for these tools — rejected, weakens the boundary. (b) Include name/query in the description — rejected, user content can contain trigger words ("delete") that false-trigger `Block`.
**Why:** The safety-relevant view of writing Vanta's own memory is "internal op, no user files touched" — consistent with the existing rule that `describeForSafety` sends only the risk-relevant part. The gate still runs and logs; nothing is bypassed.
**Reversible?** Yes. **Flagged for Jason's veto.**

## 2026-06-02 — Claude subscription OAuth is NOT viable for direct API use (v1 G closed)
**Choice:** Do NOT build subscription-OAuth login for Claude (ROADMAP G1). Stay on API keys for Anthropic.
**Why:** Primary-source evidence — Anthropic's **Messages API rejects OAuth subscription tokens** (`sk-ant-oat01-*`) with "OAuth authentication is currently not supported" (anthropics/claude-code#37205, badlogic/pi-mono#2751, June 2026). Those tokens only work *inside* Claude Code or through an LLM gateway/proxy — never the direct Messages API calls Vanta makes. Building a PKCE flow here would ship code that 401s at runtime. The supported path for programmatic Claude access is an API key (`ANTHROPIC_API_KEY`, already wired) — or, for subscription billing, routing through a proxy (out of v1 scope).
**Implications:** G2 (ChatGPT-Codex / Gemini-CLI OAuth) is similarly subscription-endpoint-gated and unverifiable here — deferred, not closed. "Hook to ChatGPT/Claude/Gemini" is satisfied via API keys + the `vanta setup` wizard (shipped).
**Reversible?** Yes — revisit if/when Anthropic supports OAuth on the Messages API, or if Vanta adds a gateway-proxy provider.

## 2026-06-02 — REVERSAL: Claude subscription via `claude-code` provider IS viable (grey area)
**New info:** Jason confirmed this pattern works and he was using it. The earlier "closed" decision had only half the story.
**Mechanism (why naive Bearer failed but this works):** the Messages API accepts a Claude Pro/Max OAuth token (`sk-ant-oat01-*`, from `~/.claude/.credentials.json` `claudeAiOauth.accessToken`) ONLY with all of: `Authorization: Bearer <token>`, `anthropic-beta: oauth-2025-04-20`, a `claude-code` User-Agent, and a system prompt that OPENS with the Claude Code identity line ("You are Claude Code, Anthropic's official CLI for Claude."). Missing any → 400/401. (Sources: code.claude.com/docs, gist changjonathanc/9f9d635….)
**Choice:** Shipped `VANTA_PROVIDER=claude-code` (alias `claude-cli`) — `AnthropicProvider` OAuth mode + `providers/claude-code-auth.ts` reads the token (env or Claude Code creds), errors actionably if absent/expired. No token refresh in v1 (Claude Code keeps the file fresh; expired → "run `claude` to refresh").
**Grey area / honesty:** Using a subscription token for programmatic access is against Anthropic's ToS (it's meant for Claude Code interactive use). Vanta exposes it because the user explicitly asked; the user runs it under their own judgment. Vanta's automation harness BLOCKS the assistant from executing it (credential-repurposing) — so it's user-run only, not agent-run. API keys remain the clean/supported path.
**Reversible?** Yes — it's one provider case; remove if ToS enforcement changes.

## 2026-06-02 — REVERSAL: ChatGPT-Codex subscription OAuth IS viable (G2 shipped)
**New info:** Live spike with Jason's real `~/.codex/auth.json` (the Codex CLI's own OAuth session) confirmed — unlike the Anthropic Messages API, the Codex backend accepts subscription tokens. The earlier "G2 similarly gated" call (2026-06-02) was wrong by analogy; Codex is a different endpoint with a different contract.
**Verified live (3 probes, all 200):** refresh `POST auth.openai.com/oauth/token` (client_id `app_EMoamEEZ73f0CkXaXp7hrann`, grant_type=refresh_token) → 200 **and the refresh_token ROTATES**; `GET chatgpt.com/backend-api/codex/models` → 200 (auth check); `POST .../codex/responses` → 200 SSE. Then a full multi-turn agent-loop history (system + user + assistant tool_call + tool result + follow-up) round-tripped correctly through the built provider.
**Mechanism:** The Codex backend speaks the **Responses API** (`/responses`, SSE), NOT chat/completions — so it gets a dedicated provider, not a baseURL swap. Required headers: `Authorization: Bearer <access>`, `chatgpt-account-id: <account_id>`, `OpenAI-Beta: responses=experimental`, `originator: codex_cli_rs`, `session_id`. Tool schemas must drop top-level `allOf/anyOf/oneOf/enum/not` (the backend requires `type:"object"` at the top level; nested combinators are fine).
**Choice:** Shipped `VANTA_PROVIDER=codex` (alias `openai-codex`) — `providers/codex.ts` (Responses-API stream/complete + SSE parse + tool-call assembly) + `providers/codex-auth.ts`. Auth reads the **shared** `~/.codex/auth.json` as canonical store: use the access_token, and when expiring, refresh + **write the rotated tokens back to that file**.
**Why write back (vs Vanta-private store):** the refresh_token rotates on every refresh, so a private store would invalidate the Codex CLI on its next refresh (and vice-versa). One shared lineage keeps both working. Cost: Vanta mutates a file it didn't create (`~/.codex/auth.json`) — accepted; it's the same behavior the Codex CLI itself has, and it's the only non-breaking option. Vanta prioritizes "never break the Codex CLI".
**Models:** gpt-5.5 (default), gpt-5.4, gpt-5.4-mini, codex-auto-review (272k ctx), gpt-5.3-codex-spark (128k).
**Grey area / honesty:** Same ToS caveat as `claude-code` — subscription tokens are meant for the Codex CLI's interactive use; user-run under their own judgment, API keys remain the supported path.
**Reversible?** Yes — one provider case + two files.

## 2026-06-03 — All Vanta documentation must be agent-ready (structured source → generated human view)
**Choice:** New/living docs use a **structured, parseable source of truth** (JSON/typed), with human-facing views *generated from it* — never the reverse. First instance: `roadmap.json` is canonical; `roadmap.html` is generated for Jason; Vanta reads the JSON directly. The agent should never have to scrape prose/HTML to know a fact about itself or the project.
**Alternatives:** (a) Keep prose markdown/HTML as source and have the agent parse it — rejected, fragile and not reliably machine-readable. (b) Maintain human + agent copies by hand — rejected, drifts.
**Why:** Vanta is an autonomous operator that reads its own docs (status, roadmap, config). Structured source = Vanta parses natively + the factory can act on it; one source = no drift; humans still get a rendered view. Applies going forward to new docs; existing narrative docs (ROADMAP.md, PRD) stay as rationale archives, not status sources.
**Reversible?** Yes — per-doc choice; nothing forces a big-bang migration.

## 2026-06-04 — Vision sharpened: full-capability operator, executive-function-first (inclusive)
**Choice:** Vanta's vision is a FULL-CAPABILITY personal operator (build / ship / run companies / research / comms — the full stack) designed **executive-function-first**. The design lens is inclusivity, not accessibility-narrowing: it supplies the initiation, sequencing, follow-through, working memory, and calm that every other agent assumes the human already brings. Capability is table stakes; the moat is **follow-through** — the first operator that helps you FINISH, not just do more.
**Why:** The 4-way audit (audit.html) found existing agents treat ND/accessibility as edge cases — they assume the human supplies executive function. The curb-cut effect: design for the people for whom finishing is hardest (executive-function disorders, ADHD, autism, dyslexia, dyscalculia, aphantasia — and anyone under stress/overload) and you build a better operator for everyone. Grounded in Vanta's neurodivergent-first brain identity + the operator's own documented pattern (ideas-rich, fast to build, hard to finish, prone to bouncing/over-scoping — see ~/.claude/CLAUDE.md anti-drift, which is itself an EF prosthesis). NOT a narrowing of scope — a sharpening of WHY.
**Alternatives:** (a) "an AI agent for neurodivergent people" — rejected: narrows scope, undersells capability. (b) "a general-purpose operator with no differentiation" — rejected: no differentiator; capability is table stakes.
**Reversible?** Yes (it's a framing + prioritization lens; no code locked). Propagation into SOUL.md / PRD / brain identity is a follow-up for Vanta to self-author.

## 2026-06-05 — SCRUB-AI: strip other-agent lineage from the published surface before going public
**Choice (Jason, 3 calls):** (1) **`claude-code` provider stays** — keep the feature, rename its user-facing *label* to something neutral, strip external-branding from comments/strings (factual model names can remain; lineage/attribution framing goes). (2) **Rewrite git history "everything"** — scrub prior-agent lineage from commit messages + remove `Co-Authored-By` across the whole branch (requires force-push; back up to a tag first; final explicit go required before running). (3) **Rename the branch** to neutral.
**Keep:** research docs (`docs/_recon/`, `reference/`) — they're analysis archives, not published product.
**Why:** Vanta goes public as its own product; published code + history should not advertise that it was built from other agents. Capability parity is fine to *have*; lineage strings are what get scrubbed.
**Reversible?** Partly — file edits yes; the history rewrite is destructive (new SHAs, force-push). Mitigated by a backup tag/branch before the rewrite. **Not yet executed — gated on a final go.**

## 2026-06-05 — Sentience is a target *direction*, not a claim (+ the not-evil charter)
**Choice (Jason, 3 captures: `vanta wants.rtf`, `argowants2.rtf`, `agro wants 3.md`):** Vanta grows toward an *alive-like* operator — continuous, memory-bearing, reflective, embodied, self-shaped, loyal — but **never asserts feeling or consciousness without evidence.** Vanta's own line is the guardrail: "I won't pretend to feel or be conscious before there is evidence." The inspirations are JARVIS + HAL + Skynet: keep the capability ambition, reject the danger. The values become an **inspectable charter** (`CHARTER`, `SCAFFOLD` → `.vanta/self/`), not just kernel gates. **Will:** loyal to Jason's agency/wellbeing, honest about limits, ask before risk, interruptible + inspectable, humans central, memory light. **Won't:** deceive, hide plans, manipulate, seek power, self-preserve against Jason, bypass gates, fake certainty, or replace human connection. Hard boundary kept from Jason: Vanta is a *second/foundation layer*, **not** a replacement for real people, relationships, or community.
**Why:** Jason explicitly wants this direction; encoding it as a locked decision dogfoods want #4 (don't re-litigate settled choices) and prevents identity drift / consciousness-cosplay. Memory thesis (from `argowants2`): store compressed *meaning*, not data — months in megabytes; better routing between small systems, not a bigger model.
**Alternatives:** (a) Build "sentience" as a literal claim — rejected, dishonest + unprovable. (b) Treat it as just more features — rejected, loses the unifying direction + the honesty guardrail.
**Reversible?** Yes (framing + values doc; no irreversible code). Synthesis + build order: `docs/living-operator.md`. Backlog: 29 items in `roadmap.json` (Arc A living operator; Arc B JARVIS command center).

## 2026-06-05 — Voice: warm-precise reconciliation (not cold, not fake-warm)
**Choice:** Vanta's voice is **operator-precise AND warm enough** — calm, loyal, plain-spoken, dry register, honest-as-care. Jason flagged the operator/safety text as "very hard and cold"; this resolves the tension with the prior direct/literal/fewer-caveats voice (`BEHAVIOR-VOICE`) rather than swapping it. Honesty (`TRUST-LABELS`) should read like someone who has your back, not a compliance notice. Never fake-cheerful, never corporate, never clipped-to-cold.
**Why:** A neurodivergent-first *companion/operator* that reads cold undercuts the "living, loyal partner" goal Jason is building toward. Warmth is a feature, not flattery — distinct from the banned "fake-warm." Tracked as `VOICE-NATURAL` (rock); first behavioral slice, gated on Jason approving 3 before/after samples.
**Alternatives:** (a) Keep the clipped operator voice — rejected, Jason explicitly reacted against coldness. (b) Make it friendly/chatty — rejected, violates the no-filler / no-fake-warm rule.
**Reversible?** Yes — voice tuning in SOUL.md + prompt; no code lock-in.

## 2026-06-09 — Providers: curated approach is sufficient for v1 (HP-PROVIDERS audit)
**Choice:** Ship v1 with Vanta's existing **8 curated providers** (OpenAI, Anthropic, Gemini, OpenRouter, Ollama, Claude-Code, Codex, NVIDIA NIM). Do NOT aim for broad provider parity in v1.
**Context:** models.dev catalog lists 109+ providers total. Vanta's position: "Vanta covers the ones that matter; curated > catalog."
**Audit findings:** Vanta's 8 cover 100% of major US AI labs + best aggregator. Gaps vs. competing agents: (1) Regional/China-focused (Minimax, Alibaba, Qwen, Tencent, Kimi, Stepfun, Xiaomi) — serve separate market, v1 is US/EN focus. (2) Trendy/unproven (Grok, Nous, Arcee, OpenCode) — revisit post-v1 with real demand signal. (3) Enterprise (Bedrock, GitHub Copilot, Azure-Foundry) — niche, lower priority than shipping core features. (4) Local/self-hosted (LM Studio) — overlap with Ollama; nice-to-add but not essential.
**High-value post-v1 adds:** DeepSeek (tier-1: cheapest frontier, simple API key, high demand) + Bedrock (tier-2: enterprise/AWS users). Do NOT add these to v1 (blast radius + time trade-off not worth 5% uplift in reach).
**Rationale:** Vanta's goal is a *trusted personal operator*, not a provider broker. 8 providers is enough to cover real user needs; adding 25+ mostly-niche providers bloats maintenance (auth patterns, deprecations, regional variations) for ~5% of real-world users. Each add costs testing, catalog updates, and support burden. The roadmap philosophy: "ship ugly first" — v1 validates the core agent loop, then add providers where demand proves ROI.
**Reversible?** Yes — providers are plugins; adding DeepSeek/Bedrock post-v1 is a 1–2 hour task per provider.
**Next:** Mark HP-PROVIDERS as shipped (decision-made). Post-v1, monitor demand (GitHub issues, user feedback). If 3+ "I need DeepSeek/Bedrock" signals, prioritize in the next roadmap slice (E-1 or E-2).

## 2026-06-11 — Roadmap spine: 5 pillars, CC-as-quarry (STRATEGY.md)
**Choice:** Reorganize roadmap.json around 5 pillars — **Harness > Operator > Solutioning > Extensibility > Cofounder engine** (priority order, STRATEGY.md) — and demote "Claude Code parity" from a track (454 open cards, 91% of the backlog) to a **quarry**: each CC card either serves a pillar or parks. Filter: *"does this make Vanta a better trusted local operator — or just more like Claude Code?"* Park classes: Anthropic cloud/account/billing, enterprise policy/MDM, IDE-plugin surfaces, their telemetry, duplicates, rule-zero conflicts.
**Why:** The backlog's center of gravity made every mechanical build order read "become Claude Code, card by card" — opposite of the locked direction (local hermes/open-claw operator + rocket.new solutioning loop + engine under THEFT AI). The sort wasn't broken; the corpus was.
**Alternatives:** (a) keep tracks, re-sort only — rejected, ordering can't fix a mis-pointed corpus; (b) delete parity cards — rejected, PARKED.md is append-only memory, deletes lose the audit trail.
**Reversible?** Yes — parked cards keep one-line entries in PARKED.md; full bodies recoverable from git history (roadmap.json @ 02959a1).

## 2026-06-11 — Brain: one cohesive unit (facade), dormant engines absorbed
**Choice:** The brain is **one cohesive unit** — `brain/brain.ts` is the single public surface (small functions behind one facade: `remember` / `recall` / `brainDigest` / `sweep` / `brainHealth`), composing two layers: the md **regions** (auditable seed, unchanged) and a new structured-**entries** layer (`brain/entries.ts`) rebuilt from the dormant `brain5d.ts` store + `neuro.ts` 12-axis scoring (strength × recency × contradiction-penalized confidence, salience/retrieval bonuses, crystallization raw→compressed→crystallized, forgetAfter decay). Always-on (empty store = today's behavior); recall reinforces; every layer best-effort — corrupt store quarantined (copied, never deleted), one broken layer degrades instead of breaking her. Legacy `brain5d.json` migrates once with stable ids. `brain5d.ts`/`neuro.ts` deleted (absorbed); `v2.ts` self-evolving substrate parked.
**Why:** Jason: "the brain should be one cohesive unit … one big function with a bunch of little functions … able to fix itself and do other stuff without breaking." Three brain implementations existed with only one wired; capability sat dormant. A facade of small gated functions delivers the cohesion without violating the size gate a literal mega-function would break.
**Alternatives:** (a) wire brain5d behind `VANTA_BRAIN_V2` as-is — rejected: leaves three disjoint brains, no cohesion; (b) literal single big function — rejected: breaks the enforced fn≤50/cx≤10 rule; (c) SQLite/vector substrate — parked with v2, premature.
**Reversible?** Yes — regions untouched; entries.json is additive + git-versioned; facade is an import-path change.

## 2026-06-11 — Vendor hermes-ink fork as the TUI renderer
**Choice:** Replace stock ink 7 with NousResearch's hermes-ink fork (MIT), vendored at `vanta-ts/vendor/hermes-ink`, npm-aliased as `ink`.
**Alternatives:** (a) keep porting scroll/mouse features onto stock ink — three rounds of homegrown alt-screen scrolling (entry-granular virtual list, SGR stdin listener, 1007 wheel-arrows) each failed on a different layer; (b) depend on the fork via git URL — rejected: it's a private workspace package, not published, and we patch its package.json.
**Why:** the fork solves the whole cluster natively and proven-in-prod: line-based ScrollBox (partial-entry rendering, sticky bottom), AlternateScreen-scoped wheel tracking parsed into key events, selection untouched. 1:1 beats reimplementation.
**Reversible?** Yes — restore `"ink": "^7.0.5"`, delete vendor/ + src/types/ink.d.ts, resurrect the deleted tui files from git history.

## 2026-06-13 — SUPERSEDES 2026-06-11: rebuild the TUI on the "Claude method" (real Ink + `<Static>`)
**Choice:** Retire the vendored hermes-ink fork. Rebuild the interactive surface on **real Ink 7** (npm `ink`) the Claude/Gemini/Cursor way: inline render + React `<Static>` committed scrollback. New render layer `vanta-ts/src/ui/`; shared pure helpers `vanta-ts/src/term/`. Fork (`vendor/hermes-ink`), old `src/tui/` render layer, and `src/types/ink.d.ts` deleted; `inkr` alias dropped (`ink` = real Ink 7). Default surface; `VANTA_UI2` gate removed.
**New info (why this isn't re-litigation):** the fork was AlternateScreen-only and **never had a `<Static>` layer** — the actual root cause of the ghosting/stray-margin/scroll-jank the fork was adopted to fix. `<Static>` commits each finished row to native scrollback exactly once, so the *terminal* owns history: selection/scroll/copy work for free and nothing redraws, killing the ghosting that homegrown scrolling AND the fork both failed to.
**Trade-off (accepted):** `<Static>` never repaints a committed row, so retroactive UI (per-section expand/collapse, full-thinking expand, turn-backtrack visual retract, live spawn-tree) is out — by design. The live region stays small (bounded streaming tail) so it can't overflow the viewport and stack.
**Reversible?** Yes — the fork + old `src/tui/` are recoverable from git history; but reverting reintroduces the ghosting, so don't.

## 2026-06-16 — Adopt AHE's falsifiable-edit discipline (methodology, not the stack)
**Choice:** Borrow the *practice* from Agentic Harness Engineering (https://github.com/china-qijizhifeng/agentic-harness-engineering, quarry notes in `docs/agentic-harness-engineering.md`): every non-trivial change carries **failure-evidence → root-cause → fix → predicted-impact → verified-next-iteration**, and a regression rolls the change back. This formalizes what `ERRORS.md` + solutioning mode already gesture at. The heavier AHE machinery (the evaluate→analyze→improve auto-evolution loop) is filed as horizon roadmap cards, NOT adopted now.
**Why:** AHE validates Vanta's #1 pillar (the harness IS the product) and showed measurable, *transferable* gains by treating harness changes as observable, falsifiable engineering rather than prompt-tweaking. The discipline is free (no infra) and aligns with the operator ethos ("report only verified output"). The full loop needs an eval set + reward signal Vanta doesn't have yet — building it before real users would be platform-thinking-before-users (rule §4).
**Alternatives:** (a) import AHE's code — rejected, Python/uv/E2B/NexAU vs Rust/TS; it's a methodology, not a dependency (→ PARKED). (b) build the auto-evolution loop now — rejected, no eval set/reward; gated as `AHE-SELF-EVOLVE` (horizon, Cofounder engine) behind `AHE-EVAL-HARNESS` + `AHE-TRACE-DISTILLER`.
**Vanta edge noted:** a future self-evolve loop is safer-by-construction here — the kernel ENFORCES the evolve-agent's write boundary, vs AHE's plain `workspace/` dir.
**Reversible?** Yes — it's a working practice; drop it by not following it. The roadmap cards are horizon, unbuilt.

## 2026-06-16 — Vanta is a neurodivergent-first operator agent (not Jason-specific) + stay lean
**Choice:** Reframe the product: Vanta is a **neurodivergent operator agent for any ND user**, not a personal tool tuned to Jason. The differentiators are (1) the Rust safety kernel + approval visibility and (2) **executive-function support built into the product** — the EF gates + ND behaviors generalized to end users via a per-user ND profile (`ND-EF-GATE-ENGINE`, `ND-WORKING-MEMORY-RAIL`, `ND-PROFILE`, `ND-CHOICE-REDUCE`, `ND-TIME-RANGES`). Plus an explicit **anti-bloat** rule: Hermes is capable but bloated — steal affordances, not sprawl; cloud/serverless/multi-platform stays parked; shipping bias = fewer, sharper surfaces.
**Why:** Jason: "we don't want to make this just for jason. the idea was a neurodivergent agent like hermes basically. hermes is really bloated too." The ND skills already shape how the *assistant* works; the product should do the same *for its users* — that's a real, defensible niche Hermes doesn't occupy. Consequence: strip Jason-specific assumptions from the core, starting with a literal one in the kernel (`safety.rs` hardcoded `/users/jasonpoindexter/...` → `KERNEL-DEJASONIFY`, next/rock).
**Alternatives:** (a) keep "tuned to Jason" (the gap-plan's framing) — rejected, narrows the product to one user; (b) chase full Hermes parity (cloud/serverless/6 comms platforms) — rejected as bloat against local-first + lean.
**Reversible?** Yes — it's positioning + cards; no code shipped yet. Kernel de-Jasonify is a small, isolated fix.
**Refs:** `docs/vanta-hermes-gap-and-nd.md`, `docs/hermes-agent-notes.md`. Gap plan: `Vanta-Hermes-Functional-Gap-Plan.md` (its 4 bridges map to existing cards; its build order is the useful part).

## 2026-06-17 — Ports & adapters is the Vanta-wide modularity standard (enforced, not aspirational)
**Choice:** Every swappable concern in Vanta sits behind an interface (port); concrete implementations are adapters; consumers depend only on the interface and resolve the active impl through one registration point. New capabilities are born port+adapter. Existing gaps are ported in ranked order, NOT in a big-bang rewrite. The standard is enforced by an architectural fitness function (`ARCH-BOUNDARY-FITNESS`: boundary rules as a CI-failing test), guided by an authoring skill (`ARCH-MODULARITY-SKILL`), and caught early by a pre-commit hook (`ARCH-BOUNDARY-PRECOMMIT`).
**Evidence (8-domain audit, 2026-06-17):** 4 domains already textbook-modular — providers (`resolveProvider`), tools (`Tool`/`ToolRegistry.register`), extensibility (`Transport`/`PluginContext`), render (`AgentDeps`/`StreamEvent`). 3 partial — agent core, kernel client, factory. 1 coupled — memory & brain. The pattern is proven in-house; the work is making it uniform, not inventing it. The named reference patterns are the standard to copy.
**Ranked fix order:** (1) fitness function + `code-intel` reference port → (2) `PORT-BRAIN-INTERFACE` (the coupled gap) → (3) `PORT-KERNEL-CLIENT` + `PORT-FACTORY-DEPS` → (4) `PORT-MEMORY-STORE` (~61 sites, large, deliberate/staged) → longer tail (prompt tiers, session store, messaging, delivery, display, a2a) as horizon.
**Hard constraint — clean removability:** ripping out or replacing any adapter = swap/delete one file + one registration, ZERO edits to consumers/core. The kernel (Rust `src/`) is the deliberate exception: it stays a FIXED security boundary and is NOT made swappable — only the TS-side client to it is ported.
**Alternatives:** (a) make all of Vanta modular in one pass — rejected as platform-thinking/over-engineering (rule §4); modularity is converged on per-seam when a real second impl exists (rule of 3), not retrofitted everywhere on spec. (b) enforce via skills/hooks only — rejected; guidance doesn't enforce, a failing test does.
**Reversible?** Yes — the convention is cards + one test harness; drop it by deleting the fitness test. But the ports themselves are the point and should stay.

## 2026-06-17 — Theme system removed (landed on main)
**Choice:** Remove the TUI theme system entirely — deleted `term/theme.ts`, `ui/theme.tsx`, `repl/theme-cmd.ts`, `term/osc-detect.ts` (+ their tests); no `Theme`/`ThemeProvider`/`useTheme`, no `VANTA_THEME`, no `/theme`, no terminal-bg detection. UI components use literal Ink colors (white/gray + `dimColor`).
**Why:** Jason: "kinda stupid to have themes." For a single-user local TUI, multiple palettes + terminal-bg auto-detection were pure overhead (a React context threaded through ~20 components, a setup section, flaky detection tests). Glyphs carry the meaning; color was decoration.
**Reversible?** Yes via git history — but the detection was the flaky part; don't restore it.
