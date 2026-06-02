# CLAUDE.md — argo-ts (agent layer)

The TypeScript agent loop. Read root `../CLAUDE.md` for the kernel + project overview. This file is the agent layer's source of truth — don't re-read every file to learn the structure; it's mapped here.

## Runtime

Node 22, ESM, `"type": "module"`. Run via `tsx` (no build step). Native `fetch`, `process.loadEnvFile` — **no dotenv, no axios.** Relative imports use `.js` extensions (ESM convention; tsx resolves to `.ts`).

## File map (`src/`)

| File | Responsibility |
|------|----------------|
| `types.ts` | Core types: `Message`, `ToolCall`, `Verdict`, `Goal`, `Risk` |
| `providers/interface.ts` | `LLMProvider` interface, `ToolSchema`, `CompletionResult`. Non-streaming (see decisions) |
| `providers/openai.ts` | OpenAI **+ Ollama** (same SDK, `baseURL` swap). Converts internal↔OpenAI message/tool shapes |
| `providers/index.ts` | `resolveProvider(env)` — reads `ARGO_PROVIDER`/`ARGO_MODEL`. Anthropic throws "Phase 4" |
| `safety-client.ts` | `fetch` client → kernel. `assess/getGoals/proposeApproval/approve/deny/logEvent/status`. Zod-validates responses |
| `kernel-launcher.ts` | `ensureKernel()` — ping, else spawn detached with `ARGO_ROOT` + cwd, poll 5s |
| `scope.ts` | `resolveInScope(target, root)` — path containment, mirrors kernel's `inside_scope` |
| `tools/types.ts` | `Tool` (schema + optional `describeForSafety` + `execute`), `ToolContext`, `ToolResult` |
| `tools/registry.ts` | `ToolRegistry`: register/get/list/schemas |
| `tools/{read-file,write-file,shell-cmd,inspect-state}.ts` | The four v0 tools |
| `tools/index.ts` | `buildRegistry()` |
| `prompt.ts` | `buildSystemPrompt()` — 3 tiers: stable (SOUL+tools+rules) / context (ARGO/AGENTS/CLAUDE.md) / volatile (goals+time) |
| `context.ts` | `trimMessages()` — 75% trigger, protect first-3/last-6, orphan-tool guard |
| `agent.ts` | `runAgent()` + `dispatchTool()` — the loop |
| `cli.ts` | `argo run "..."` entry: load env, find repo root, ensure kernel, build prompt, run |

## The loop (`agent.ts`)

```
messages = [system, user]
each iteration (max ARGO_MAX_ITER=50):
  trim → provider.complete(messages, schemas)
  no tool calls + non-empty text → DONE
  no tool calls + empty → nudge once
  for each tool call → dispatchTool:
    describeForSafety(args) → safety.assess()
      block → tool_result "blocked", no exec
      ask   → requestApproval(y/n); propose+approve|deny in kernel
      allow → execute
    append tool_result; logEvent
  3 consecutive empty results → stop
```

**Safety is two-layer:** `assess()` gates on the kernel (keyword/scope). Tools also self-check (path scope, overwrite approval via `ctx.requestApproval`). `describeForSafety` sends only the risk-relevant part to assess (path/command, **not** file content — else content keywords false-trigger).

## How to add a tool

1. New file `tools/<name>.ts` exporting a `Tool`: `schema` (name, description, JSON-schema `parameters`), `describeForSafety` (return the safety-relevant string), `execute(args, ctx)`.
2. Parse `args` with **zod** (`safeParse`) — it's an LLM boundary.
3. Path args → `resolveInScope`; return `{ok:false}` if outside.
4. Return `ToolResult` (errors-as-values, never throw across the boundary).
5. Register in `tools/index.ts`. Add a test in `tools/tools.test.ts`.

## How to add a provider

Implement `LLMProvider` (`complete`/`modelId`/`contextWindow`), add a branch in `providers/index.ts`. Keep the agent loop provider-agnostic — it only sees the interface.

## Key decisions (don't re-litigate without new info)

- **Non-streaming in v0** — the loop waits for the full tool call before executing anyway; streaming only adds live text display. Fits behind the interface later.
- **No Anthropic stub** — `resolveProvider` throws a clear "Phase 4" error instead of a fake adapter. Per global rule: no stubs returning fake values.
- **Kernel is the boundary** — TS never decides safety; it asks the kernel. `assess` before every tool.
- **Tool results are values, not exceptions** — `{ok, output}`. The loop never crashes on a tool error.

## Conventions

ESM `.js` imports · zod at every LLM/HTTP boundary · errors-as-values in tools · files <300 lines, fns <50 · `tsc --noEmit` must be clean before done · co-located `*.test.ts` (vitest). Integration tests in `agent.test.ts` use a `FakeProvider` + live kernel; they self-skip if the kernel is down.

## Env

`ARGO_PROVIDER` (openai|ollama|anthropic) · `ARGO_MODEL` · `OPENAI_API_KEY` · `ARGO_OLLAMA_URL` · `ARGO_KERNEL_URL` · `ARGO_MAX_ITER`. Defaults in `.env.example`. Local `.env` (gitignored) defaults to Ollama qwen2.5:14b.
