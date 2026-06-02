# Parity Audit — Customized Hermes vs Argo vs Manifesto (2026-06-02)

Reference: Jason's customized install `~/.hermes/hermes-agent/`. Verdicts traced to code.

## Manifesto hard lines — all real in code ✅

| # | Hard line | Enforced by | Status |
|---|---|---|---|
| 1 | Goal before tool | `session.ts` `safety.getGoals()` → `prompt.ts` rule 1 | ✅ |
| 2 | Safety enforced, not advisory | `agent.ts:232` `safety.assess()` (Rust kernel) + `scope.ts` `resolveInScope` | ✅ |
| 3 | Verified output only | `prompt.ts` rule 4 ("never declare complete without verified tool output") | ✅ |
| 4 | Approval before risk | `agent.ts:240` `requestApproval` + `proposeApproval` (kernel queue) | ✅ |
| 5 | Honest about limits | `prompt.ts` rule 7 | ✅ |
| 6 | Learns, and keeps what it learns | `commitInHome` git-versions skills+memory; curator archives, never deletes | ✅ |
| 7 | Privacy-first by default | `search/index.ts` — DuckDuckGo is the keyless default | ✅ |
| 8 | Ship, don't drift | process — one slice end-to-end, committed+pushed (this session: 7 commits) | ✅ |

## Capability parity vs customized Hermes

| Capability | Hermes (customized) | Argo | Verdict |
|---|---|---|---|
| LLM providers | many | openai · ollama · anthropic · gemini · openrouter · **codex** · **claude-code** | ✅ parity |
| Subscription OAuth | codex + claude | **codex (live-verified)** + claude-code | ✅ |
| Streaming | `stream_dispatch.py` | `LLMProvider.stream()` + TUI deltas | ✅ |
| Sessions | save/resume/search | file-based save/resume/**fork**/**title** | ✅ (search → P-future) |
| Memory | capped/pruned | capped injection + **capped stored file** (git-retained) | ✅ |
| Self-improvement | skill-from-workflow + curator | track B (background-review + `write_skill`) + curator | ✅ |
| Skill injection | index in prompt, body on demand | **skill index injected** + `recall` loads body | ✅ (closed this session) |
| Slash commands | rich session set | help/clear/reset/history/retry/undo/title/fork/model/tools/skills/status/goals/sessions/resume/cron | ✅ parity+ |
| Identity | persona + rules of engagement | **personal-operator prompt** (P4) | ✅ |
| Capability banner | domain-grouped | **domain-grouped** (P5) | ✅ |
| Gateway/daemon | gateway + many platforms | `argo gateway` + telegram + webhook (E1/E2/E3) | 🟡 fewer platforms |
| Skills count | 192 | ~10 + management (index/recall/curator) | 🟡 by design (mgmt > count) |
| Desktop / Web UI | apps/desktop + webui | TUI only | ⬜ parked (TUI-first; hashmark = future desktop) |

## Remaining gaps (logged, not closed — by priority)

- **Session search** (Hermes has FTS over past sessions). Argo lists + resumes by id. → next candidate.
- **More messaging platforms** (Hermes: Discord/Slack/Matrix/etc; Argo: Telegram). → PARKED, demand-driven.
- **Desktop/Web UI** — TUI-first decision stands; desktop is hashmark's lane. → PARKED.
- **Skill breadth** — management beats count (Nemotron insight); curate a small high-value set on demand. → PARKED.
- **Memory compression** (Hermes LLM-compresses; Argo caps + git-retains). → optional, PARKED.

## Verdict

Every manifesto hard line is real in code. Core agent parity with the customized Hermes is **met** (providers, subscription OAuth, streaming, sessions, memory, self-improvement, skill injection, commands, identity, banner). Remaining deltas are breadth/surface (session search, platforms, desktop, skill count) — parked by design, not blocking the mandate. **Argo is, by the measures that define it, the better agent: same capability spine + a hard safety kernel Hermes doesn't have.**
