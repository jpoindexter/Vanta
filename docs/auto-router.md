# AUTO-ROUTER — automatic per-task model routing + ephemeral subagents

> Roadmap item `AUTO-ROUTER` (Models + Setup, rock). Source: Vanta's own design pass
> (`vanta ability.rtf`, 2026-06-05). Supersedes the `MODEL-SPINUP` placeholder.

## The idea

Keep the main brain on the chosen premium model (e.g. `codex/gpt-5.5`) as the
commander. For **bounded** subtasks — summarize, classify, research, verify, memory
compression, first-pass code search — Vanta automatically spins up a scoped subagent on
a cheaper local/cloud model, uses its output, then tears it down (local Ollama unloads
via `keep_alive:"0s"`; cloud workers are stateless). The main brain reviews the result
before Jason sees or acts on it.

**Vanta already has ~60% of this.** `delegate`/`swarm` (`tools/delegate.ts`,
`tools/swarm.ts`) can already run a subagent on an explicit provider/model;
`routing/model-router.ts` only does crude cheap/expensive same-provider routing;
`routing/vision.ts` (AUX-VISION) is the aux-task pattern already shipped. So this is a
**router layer on top of the existing subagent system, not a new agent system.**

```
Main brain (commander) ──▶ auto-router (dispatcher) ──▶ subagent (temporary worker)
        ▲                                                        │
        └──────────────── reviews worker output ◀───────────────┘
              Kernel = the same boundary for everyone (no extra authority)
```

## The missing piece: automatic selection

`routing/auto-router.ts` (new):

```ts
type TaskKind = "tiny" | "summarize" | "classify" | "research" | "code"
  | "debug" | "vision" | "creative" | "planning" | "verification" | "high_stakes";

classifyTaskKind(instruction): TaskKind
resolveTaskRoute(env, task): ModelRoute        // { provider, model, maxIterations?, reason }
routeEnv(env, route): NodeJS.ProcessEnv         // overlays VANTA_PROVIDER/VANTA_MODEL
```

Config by env (mirrors the AUX-VISION pattern), e.g.:

```
VANTA_MAIN_PROVIDER=codex      VANTA_MAIN_MODEL=gpt-5.5
VANTA_ROUTE_SUMMARIZE=ollama:qwen2.5:14b
VANTA_ROUTE_CLASSIFY=ollama:qwen2.5:7b
VANTA_ROUTE_RESEARCH=gemini:gemini-2.5-flash
VANTA_ROUTE_VERIFY=ollama:deepseek-r1:14b
VANTA_ROUTE_MEMORY=ollama:qwen2.5:14b           # pairs with MEM-CURATOR
```

## Hard rules

- **Fail soft.** Route unavailable (Ollama down, missing key/model) → fall back to the
  main model with a one-line note. No task dies because a cheap route failed, unless
  `VANTA_ROUTE_STRICT=true`.
- **Cheaper, not freer.** Every worker uses the same kernel, root scope, approval gates,
  and tool registry — usually with `delegate` excluded (no recursive runaway). Already
  enforced in `delegate.ts`/`swarm.ts`.
- **No cheap models for risk.** `if (task.risk === "high") return mainRoute;` — never
  auto-route security/financial/legal/irreversible/commits/kernel-safety/final
  user-facing claims to a weak local model. Cheap workers draft or inspect; the main
  brain reviews.
- **Show the work.** Surface `worker: ollama/qwen2.5:14b · reason: low-risk summarization`
  in tool activity/status. Pairs with `COST-VISIBLE`.

## Build order (4 slices)

1. **Pure module** — `routing/auto-router.ts` + test: parse `provider:model` route
   strings, classify task kind, resolve configured route, fall back to main. No tools yet.
   *Done:* tests prove summarize→Ollama, debug→main/strong, missing config→main.
2. **`auto_delegate` tool** — `tools/auto-delegate.ts`, registered in `tools/index.ts`:
   accepts `{goal, instruction, kind?}`, picks the route, spawns the subagent, returns
   output tagged with the provider/model used. Child cannot spawn further delegates.
   *Done:* auto_delegate uses local Qwen when configured; fallback works.
3. **`/routes` command** — show main brain + aux routes + availability + fallback mode
   (also `/aux`). *Done:* Jason sees the routing table in one command.
4. **Auto-use in the loop** — prompt/tool guidance: *for bounded subtasks, prefer
   `auto_delegate` over doing everything in the main context; main model for final
   synthesis + high-risk.* *Done:* the main model naturally spins up local workers
   without Jason naming a model.

Slice 1 absorbs the planned `AUX-MAP` (per-function model map) as its config layer.
