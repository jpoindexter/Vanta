# Vanta design-space self-audit — vs the 13 Claude Code principles

Scores Vanta against the 13 design principles from *Dive into Claude Code* (arXiv:2604.14228, Table 1; see `dive-into-claude-code.md`). HAVE = real + enforced · PARTIAL = present but incomplete · GAP = missing. The GAPs/PARTIALs are the impact-ranked backlog (`PAPER-*`/`HARNESS-*`/`SELFHARNESS-*` cards).

| # | Principle | Verdict | Evidence / gap |
|---|---|---|---|
| 1 | Deny-first with human escalation | **HAVE** | Rust kernel `assess()` → allow/ask/block, deny-first; approvals queue; Claude-style approval menu. |
| 2 | Graduated trust spectrum | **PARTIAL** | tighten-only permissions + always-allow + Shift+Tab auto-accept mode. **Gap:** no trust *trajectory* (auto-approve rising with session count). |
| 3 | Defense-in-depth (layered) | **HAVE** | kernel + permission rules (tighten-only) + protected-paths + auto-accept keeps `block` immovable. |
| 4 | Externalized programmable policy | **PARTIAL** | `permissions.tsv` + shell-hooks engine. **Gap:** hook event coverage vs the 27 (`PAPER-HOOK-EVENTS-27`). |
| 5 | Context-as-scarce-resource | **PARTIAL** | compress/CCR + `/context` viz + per-result budget. **Gap:** the 5-layer graduated pipeline + deferred schemas + observation masking + tool scoping (`PAPER-GRADUATED-COMPACTION`, `PAPER-DEFERRED-SCHEMAS`, `HARNESS-OBSERVATION-MASKING`, `HARNESS-TOOL-SCOPING`). |
| 6 | Append-only durable state | **HAVE** | `events.jsonl`, `goals.tsv`, session JSONL, the new `session_config` event. |
| 7 | Minimal scaffolding / maximal harness | **PARTIAL** | rich 3-tier prompt + deterministic harness. **Gap:** no pruning discipline (`HARNESS-THICKNESS-AUDIT`). |
| 8 | Values over rules | **HAVE** | SOUL.md + self-layer + judgment-based prompt rules backed by the kernel floor. |
| 9 | Composable multi-mechanism extensibility | **HAVE** | MCP (mount + terminal-love) + skills + hooks + 67 tools. |
| 10 | **Reversibility-weighted risk** | **GAP** | kernel gates by keyword + scope only, not reversibility. `PAPER-REVERSIBILITY-RISK` — **needs sign-off** (touches the privacy gate on out-of-root reads). |
| 11 | Transparent file-based config + memory | **HAVE** | CLAUDE.md, `.vanta/`, brain files, settings, `.env`. |
| 12 | Isolated subagent boundaries | **PARTIAL** | delegate/swarm + worktree isolation. **Gap:** summary-only return + sidechain transcripts (`SELFHARNESS-SUBAGENT-SIDECHAIN`). |
| 13 | Graceful recovery + resilience | **HAVE** | `sanitizeMessages` self-heal, age-gated resume, fail-closed on kernel-down, tool-retry. |

## Impact-ranked backlog (what this audit surfaces)
1. **#10 Reversibility-weighted risk** — only true GAP; highest leverage on the core differentiator, but **needs a decision** (it changes the security boundary). Do NOT auto-apply.
2. **#5 Context pipeline** — biggest PARTIAL cluster (graduated compaction, deferred schemas, masking, tool scoping). Harness-pillar, high leverage, mostly safe/bounded.
3. **#12 Subagent isolation** — sidechain + summary-only return; bounded.
4. **#4 Hook coverage** — map vs the 27; bounded.
5. **#2 Graduated trust trajectory** + **#7 scaffolding pruning** — longer-horizon.

8 HAVE · 4 PARTIAL · 1 GAP — Vanta is strongly aligned; the remaining work is the context pipeline (#5) and the reversibility decision (#10).
