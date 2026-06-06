# Claude CLI gaps — non-coding features Vanta lacks (2026-06-02)

Source: Claude Code 2.1.156 (installed). Excludes coding-specific features (/init,
/review, /pr-comments, LSP, /hooks, /terminal-setup, /bug). Vanta side verified
against the repo, not assumed.

## Verified gaps (Vanta does NOT have these)

| Feature | Claude Code | Vanta today | Priority |
|---|---|---|---|
| **Queued input while busy** | type during a turn → queued for next | `submit` doesn't queue; no type-ahead | ★★★ foundational UX |
| **@-file mentions** | `@path` autocomplete to reference files | none in composer | ★★★ |
| **Notifications** | bell / desktop ping when done or needs input | none (`mcp/client` notif = unrelated JSON-RPC) | ★★★ (matters for an operator you leave running) |
| **Real token/cost usage** | true counts + $ from API responses | estimates `chars/4`; providers don't surface usage | ★★ |
| **/context (visual)** | colored token-budget map | `/usage` text + status-bar % only | ★★ |
| **/compact (manual)** | compact context on command | auto-summarizer only (`context.ts`); no command | ★★ |
| **/memory quick-add (#)** | `#` to capture a memory mid-turn | auto run-memory only; no quick-add | ★★ |
| **In-session todo/plan list** | TodoWrite task tracking | none (only prose in mode text) | ★★ |
| **Plan mode** | propose plan → approve before acting | per-action kernel approval, not plan-level | ★★ |
| **Multi-directory (/add-dir)** | operate across several roots | single root | ★ |
| **/export** | save conversation to file/markdown | none (sessions are JSON only) | ★ |
| **/mcp (manage)** | list/add/reconnect MCP in-session | mounts via config; no command | ★ |
| **Output styles / themes** | `/config` theme + output styles | spinner styles only | ★ |
| **Vim input mode** | `/vim` editing | basic readline keys (Ctrl+U/W etc.) | ◦ low |

## Already at/above parity (for context)
Slash palette, `/model` picker, `/clear /resume /sessions /history /retry /undo /title /fork /copy /usage /update /goal`, streaming, approvals, **image paste/drag-drop** (just shipped), session resume, capped memory, skill index + recall, curator.

## Recommended build order (non-coding UX)
1. **Queued input while busy** — the foundational one; you constantly want to type ahead. (TUI reducer + a pending-input queue drained on turn end.)
2. **@-file mentions** — composer autocomplete that inserts a path (pairs with the new image attach).
3. **Notifications** — terminal bell + optional `osascript` desktop ping on turn-complete / approval-needed. Essential for a leave-it-running operator.
4. **Real usage/cost** — capture `usage` from provider responses (OpenAI/Anthropic/Gemini return it; Codex SSE `response.completed` carries it) → exact tokens + cost in `/usage` and the status bar.
5. **/context + /compact** — visual budget + manual compaction.
6. **/memory # quick-add** — teach Vanta mid-conversation.

Then the ★ tier (export, mcp command, multi-dir, themes) as demand-driven.
