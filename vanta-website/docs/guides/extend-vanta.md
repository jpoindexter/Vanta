---
id: extend-vanta
title: Extend Vanta with a tool
sidebar_position: 3
---

# Extend Vanta with a tool

Add a new capability that's kernel-gated like every built-in. (To add a *whole external toolset* instead, mount an [MCP server](../mcp.md) — no code.)

## 1. Create the tool

`vanta-ts/src/tools/word-count.ts`:

```ts
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
  describeForSafety: (a) => `read file ${a.path}`,   // only the path goes to the kernel
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

## 2. Register it

Add it to the `ALL_TOOLS` array in `vanta-ts/src/tools/all-tools.ts` (not `index.ts`).

## 3. Test it

Co-locate `word-count.test.ts`, then:

```bash
cd vanta-ts && npm test -- word-count
npm run typecheck            # must be clean
```

The [size gate](../modularity.md#the-fitness-function--the-size-gate) runs on every write — keep the file ≤300 lines, the function ≤50.

## 4. Use it

Restart Vanta; the model now sees `word_count` in its scoped catalog (and can always reach it via `tool_search`). The kernel classifies the `describeForSafety` string before each call.

## Rules of the road

- Parse args with **zod** — it's an LLM boundary.
- Path args → `resolveInScope`; return `{ok:false}` if outside.
- Return errors as values; never throw across the boundary.
- Rule Zero still applies — destructive/out-of-scope actions are gated by the kernel regardless of your tool.

For providers, search backends, plugins, and MCP, see [Extending Vanta](../extending.md).
