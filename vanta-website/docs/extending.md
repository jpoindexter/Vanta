---
id: extending
title: Extending Vanta
sidebar_position: 2
---

# Extending Vanta

Vanta follows a ports-and-adapters shape throughout — you swap or add an implementation without touching the agent loop. Everything you add stays kernel-gated.

## Add a tool

1. Create `vanta-ts/src/tools/<name>.ts` exporting a `Tool`:
   - `schema` — `name`, `description`, JSON-schema `parameters`
   - `describeForSafety(args)` — the safety-relevant string (path / command) the kernel assesses
   - `execute(args, ctx)` — returns a `ToolResult` (`{ ok, output }`)
2. Parse `args` with **zod** (`safeParse`) — it's an LLM boundary.
3. Path args → `resolveInScope`; return `{ ok: false }` if outside.
4. Never throw across the boundary — return errors as values.
5. Register it in `tools/all-tools.ts` and add a test.

```ts
// tools/word-count.ts
import { z } from "zod";
import type { Tool } from "./types.js";
import { resolveInScope } from "../scope.js";

const Args = z.object({ path: z.string() });

export const wordCount: Tool = {
  schema: {
    name: "word_count",
    description: "Count the words in a file.",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  // Only the safety-relevant string is sent to the kernel — never file content.
  describeForSafety: (a) => `read file ${a.path}`,
  async execute(rawArgs, ctx) {
    const parsed = Args.safeParse(rawArgs);
    if (!parsed.success) return { ok: false, output: "word_count: path is required" };
    const inScope = resolveInScope(parsed.data.path, ctx.root);
    if (!inScope.ok) return { ok: false, output: `out of scope: ${parsed.data.path}` };
    const text = await ctx.readFile(inScope.path);
    return { ok: true, output: `${text.trim().split(/\s+/).filter(Boolean).length} words` };
  },
};
```

## Add a provider

Implement `LLMProvider` (`complete` / `modelId` / `contextWindow`) and add a branch in `providers/index.ts`. The loop only sees the interface, so nothing else changes. See [Providers](./providers.md).

## Add a search backend

Implement `SearchProvider` (`id` + `search(query, config)`) in `search/<name>.ts` and add a branch in `search/index.ts`. Keep parse/shape logic in a pure exported function and unit-test it with an inline fixture (no network).

## Mount an MCP server

Vanta speaks MCP both ways:

- **As a client** — list servers in `.mcp.json` (project) or `~/.vanta/mcp.json` (user); their tools mount as kernel-gated Vanta tools. Or mount one at runtime with the `mount_mcp` tool.
- **As a server** — `vanta mcp serve` exposes a bounded, read-only allowlist of Vanta tools to other MCP clients; every call is still gated by `assess()`.

## Plugins

The opt-in plugin framework loads in-process plugins from `~/.vanta/plugins/<name>/plugin.json`. A plugin's `register(ctx)` can add tools and slash commands; plugin tools must be namespaced, define `describeForSafety`, and run through the same kernel-gated dispatch. Project plugins require explicit trust (`plugins.trustProjectPlugins=true` + `VANTA_ENABLE_PROJECT_PLUGINS=true`).

## House rules

- ESM only, `.js` import extensions, Node 22, run via `tsx` (no build step).
- Size gate: files ≤ 300 lines, functions ≤ 50, ≤ 4 params, cyclomatic ≤ 10 — enforced on TS writes.
- `tsc --noEmit` must be clean; co-located `*.test.ts` (vitest).
- **Rule Zero:** no deletes, overwrites, out-of-scope writes, or secret handling without explicit approval — enforced by the kernel on every call.
