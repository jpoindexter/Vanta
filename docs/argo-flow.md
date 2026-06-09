# Vanta Runtime Flow — mapped against Reference implementation

The blueprint. This traces how Reference implementation actually runs end-to-end (entry → loop →
subsystems) and maps each step to Vanta's implementation + status. Build Vanta to
this flow, not to a feature list.

`docs/agent-map.html` is the *component* inventory (symbol → Vanta equivalent).
This is the *flow*: how those components connect at runtime.

---

## 1. The spine (how Reference implementation runs, what Vanta does)

```mermaid
flowchart TD
  CLI["entry: vanta (no args) | vanta chat | vanta run \"...\"<br/>Reference implementation: reference_cli/main.py"] --> BOOT

  subgraph BOOT["bootstrap (once per launch)"]
    direction TB
    B1["load .env / config"]
    B2["ensure store ~/.vanta (skills, memory, git)"]
    B3["ensure kernel on :7788 (auto-spawn)"]
    B1 --> B2 --> B3
  end

  BOOT --> BANNER["banner + inventory: logo, model, goals, tools, skills<br/>Reference implementation: reference_cli/banner.py + inventory.py · Vanta: interactive.ts renderBanner"]
  BANNER --> REPL{"REPL prompt: vanta ›<br/>(vanta run skips straight to TURN)"}

  REPL -->|/exit| QUIT["quit"]
  REPL -->|/help /skills| REPL
  REPL -->|message| TURN

  subgraph TURN["one turn — conversation.send()<br/>Reference implementation: agent/conversation_loop.run_conversation · Vanta: agent.ts runTurn"]
    direction TB
    T1["compress/trim history<br/>context.ts compressMessages"] --> T2["build prompt: SOUL + context + goals + memory<br/>prompt.ts buildSystemPrompt"]
    T2 --> T3["model call<br/>providers/* (openai · ollama · anthropic)"]
    T3 --> T4{"tool calls?"}
    T4 -->|"no → final text"| T7["print + persist memory + skill-learning nudge"]
    T4 -->|yes| T5["per tool: describeForSafety → kernel.assess()"]
    T5 --> T6{"risk"}
    T6 -->|block| T3
    T6 -->|ask| ASK["requestApproval y/n"] --> T3
    T6 -->|allow| EXEC["tool.execute (scope-checked)"] --> T3
    T7 -.->|iteration budget not hit| T3
  end

  TURN -->|done| REPL
  T7 --> MEM["~/.vanta memory + skills (git-versioned)"]

  KERNEL["Rust kernel :7788 — ENFORCED boundary<br/>assess · approvals · goals · events · cockpit"]
  T5 -.assess.-> KERNEL
  EXEC -.log event.-> KERNEL
  ASK -.propose/approve.-> KERNEL
```

The kernel lane is the one structural thing Vanta has that Reference implementation does not:
Reference implementation safety is advisory ("NOT a security boundary"); Vanta's `assess()` is a
hard gate every tool passes through.

---

## 2. Subsystems (the `agent/` dir → Vanta modules)

| Reference implementation (`agent/…`, `reference_cli/…`) | Vanta | Status |
|---|---|---|
| `conversation_loop.py` | `agent.ts` (runTurn / createConversation) | ✅ |
| `prompt_builder.py` | `prompt.ts` (3-tier + memory) | ✅ |
| `context_compressor.py`, `conversation_compression.py` | `context.ts` (compressMessages + trim) | ✅ |
| `anthropic_adapter.py`, provider adapters | `providers/{openai,anthropic}.ts` | ✅ |
| `memory_manager.py`, `memory_provider.py` | `memory/store.ts` | ✅ |
| `curator.py`, `background_review.py` | `skills/curator.ts` | ⚠️ built, **not wired post-turn** |
| skills hub / `skills_config.py` | `skills/*` + `write_skill`/`recall` | ✅ |
| `browser_provider.py`, `browser_registry.py` | `tools/browser-*.ts` + allowlist | ✅ |
| `lsp/` | `lsp/ts-service.ts` + `tools/lsp.ts` | ✅ (.ts only) |
| `google_oauth.py` | `google/auth.ts` | ✅ (needs OAuth client) |
| `file_safety.py` | Rust kernel `safety` | ✅ (enforced) |
| `iteration_budget.py` | `maxIterations` in the loop | ✅ |
| `display.py` (banner/spinner) | `interactive.ts` renderBanner | ✅ (no spinner) |
| `reference_cli/banner.py` + `inventory.py` | `interactive.ts` banner | ⚠️ no MCP row |
| `reference_cli/cron.py` + scheduler | `schedule/*` + `vanta cron` | ✅ (needs OS trigger) |
| `reference_cli/goals.py` | kernel goals + `inspect_state` | ✅ |
| subagents / swarm | `subagent/spawn.ts` + `delegate` | ✅ |
| ACP / A2A | `a2a/*` (local) | ⚠️ local only |

---

## 3. Gaps the flow reveals — the real "what's next"

Vanta has the subsystems; the **flow/experience layer** is where it's thin (this
is why it felt like "just scripts"). In priority order:

1. **Interactive session** — `vanta` with no args now launches a banner + chat REPL with persistent history (Reference implementation's default). **Just built (`interactive.ts`).**
2. **First-run onboarding** — Reference implementation `setup` wizard configures provider/keys on first launch. Vanta makes you edit `.env`. → add `vanta setup`.
3. **`vanta status` / `vanta doctor` (TS side)** — Reference implementation surfaces component health. Vanta's kernel has `doctor`; the agent CLI doesn't surface it. → add.
4. **Post-turn background review** — Reference implementation nudges memory/skill curation *after each turn*; Vanta's `curate()` exists but nothing calls it in the loop. → wire into `runTurn` post-turn.
5. **Sessions (persist/resume conversations)** — Reference implementation browses + resumes past sessions; Vanta keeps per-goal memory but not full transcripts. → add session store.
6. **MCP client** — Reference implementation mounts MCP servers (the banner's "MCP Servers" row). Vanta went direct (googleapis-style); no MCP mount. → decide: add MCP client, or own each integration.
7. **Gateway/service mode** — Reference implementation runs as a background service; Vanta has `cron` but no daemon. → maps to a future `vanta gateway`.

Items 1–4 are small and high-impact on "feels like an agent." 5–7 are larger.
Tracked against `PARKED.md`.
