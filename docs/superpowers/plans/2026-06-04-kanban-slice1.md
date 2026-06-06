# KANBAN Slice 1 — roadmap_move tool + CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `roadmap_move` Vanta tool and `vanta roadmap move <id> <status>` CLI command that update roadmap.json and regenerate roadmap.html.

**Architecture:** Pure `moveRoadmapItem(repoRoot, id, toStatus)` function in `roadmap/move.ts` → thin tool wrapper in `tools/roadmap-move.ts` → thin CLI dispatch in `cli/ops.ts`. Each layer is independently testable. No existing file is restructured.

**Tech Stack:** TypeScript, Node 22 ESM, Zod, Vitest. Existing modules: `roadmap/schema.ts` (STATUS enum, RoadmapSchema), `roadmap/build.ts` (buildRoadmap).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `vanta-ts/src/roadmap/move.ts` | Pure fn: read → validate → patch → write → rebuild |
| Create | `vanta-ts/src/roadmap/move.test.ts` | Unit tests for moveRoadmapItem |
| Create | `vanta-ts/src/tools/roadmap-move.ts` | Vanta tool wrapping moveRoadmapItem |
| Modify | `vanta-ts/src/tools/index.ts` | Register roadmapMoveTool in ALL_TOOLS |
| Modify | `vanta-ts/src/tools/tools.test.ts` | Add "roadmap_move" to sorted registry list |
| Modify | `vanta-ts/src/cli/ops.ts` | Add move subcommand to runRoadmapCommand |
| Modify | `vanta-ts/src/cli.ts` | Pass rest[] to runRoadmapCommand; update usage string |

---

## Task 1: Pure move function + tests

**Files:**
- Create: `vanta-ts/src/roadmap/move.ts`
- Create: `vanta-ts/src/roadmap/move.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `vanta-ts/src/roadmap/move.test.ts`:

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { moveRoadmapItem } from "./move.js";

const FIXTURE = {
  updated: "2026-01-01",
  items: [
    {
      id: "ND2",
      track: "Executive Function",
      title: "clarify tool",
      status: "next",
      size: "S",
      summary: "A summary.",
      done: "Done when asked.",
    },
    {
      id: "KANBAN",
      track: "Core UX",
      title: "Live roadmap kanban",
      status: "next",
      size: "M",
      summary: "Kanban.",
      done: "Move works.",
    },
  ],
};

let dir: string;

async function makeRoadmap(data = FIXTURE): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), "vanta-move-"));
  await writeFile(join(dir, "roadmap.json"), JSON.stringify(data, null, 2), "utf8");
  return dir;
}

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("moveRoadmapItem", () => {
  it("updates the item status and returns the updated item", async () => {
    const root = await makeRoadmap();
    const item = await moveRoadmapItem(root, "ND2", "building");
    expect(item.id).toBe("ND2");
    expect(item.status).toBe("building");
  });

  it("persists the new status to roadmap.json", async () => {
    const root = await makeRoadmap();
    await moveRoadmapItem(root, "ND2", "shipped");
    const raw = await readFile(join(root, "roadmap.json"), "utf8");
    const data = JSON.parse(raw);
    const nd2 = data.items.find((i: { id: string }) => i.id === "ND2");
    expect(nd2.status).toBe("shipped");
  });

  it("updates the top-level updated field to today", async () => {
    const root = await makeRoadmap();
    await moveRoadmapItem(root, "ND2", "next");
    const raw = await readFile(join(root, "roadmap.json"), "utf8");
    const data = JSON.parse(raw);
    expect(data.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.updated).toBe(new Date().toISOString().slice(0, 10));
  });

  it("regenerates roadmap.html", async () => {
    const root = await makeRoadmap();
    await moveRoadmapItem(root, "KANBAN", "building");
    const { access } = await import("node:fs/promises");
    await expect(access(join(root, "roadmap.html"))).resolves.toBeUndefined();
  });

  it("throws when the id does not exist", async () => {
    const root = await makeRoadmap();
    await expect(moveRoadmapItem(root, "NOPE", "next")).rejects.toThrow(
      "no item with id 'NOPE'",
    );
  });

  it("does not mutate other items", async () => {
    const root = await makeRoadmap();
    await moveRoadmapItem(root, "ND2", "shipped");
    const raw = await readFile(join(root, "roadmap.json"), "utf8");
    const data = JSON.parse(raw);
    const kanban = data.items.find((i: { id: string }) => i.id === "KANBAN");
    expect(kanban.status).toBe("next");
  });
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd vanta-ts && npx vitest run src/roadmap/move.test.ts 2>&1 | tail -10
```

Expected: fails with "Cannot find module './move.js'"

- [ ] **Step 3: Implement `roadmap/move.ts`**

Create `vanta-ts/src/roadmap/move.ts`:

```typescript
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RoadmapSchema } from "./schema.js";
import type { RoadmapItem, Status } from "./schema.js";
import { buildRoadmap } from "./build.js";

export async function moveRoadmapItem(
  repoRoot: string,
  id: string,
  toStatus: Status,
): Promise<RoadmapItem> {
  const src = join(repoRoot, "roadmap.json");
  const raw = await readFile(src, "utf8");
  const data = RoadmapSchema.parse(JSON.parse(raw));

  const item = data.items.find((i) => i.id === id);
  if (!item) {
    throw new Error(`no item with id '${id}' in roadmap.json`);
  }

  item.status = toStatus;
  data.updated = new Date().toISOString().slice(0, 10);

  await writeFile(src, JSON.stringify(data, null, 2) + "\n", "utf8");
  await buildRoadmap(repoRoot);

  return item;
}
```

- [ ] **Step 4: Run tests — expect all 6 to pass**

```bash
cd vanta-ts && npx vitest run src/roadmap/move.test.ts 2>&1 | tail -15
```

Expected: 6 passed

- [ ] **Step 5: Typecheck**

```bash
cd vanta-ts && npm run typecheck 2>&1
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add vanta-ts/src/roadmap/move.ts vanta-ts/src/roadmap/move.test.ts
git commit -m "feat(KANBAN): moveRoadmapItem — pure fn, 6 tests green"
```

---

## Task 2: roadmap_move Vanta tool

**Files:**
- Create: `vanta-ts/src/tools/roadmap-move.ts`
- Modify: `vanta-ts/src/tools/index.ts`
- Modify: `vanta-ts/src/tools/tools.test.ts`

- [ ] **Step 1: Write the failing registry test**

In `vanta-ts/src/tools/tools.test.ts`, add `"roadmap_move"` to the sorted list between `"recall"` and `"run_code"`:

```typescript
      "read_file",
      "recall",
      "roadmap_move",   // add this line
      "run_code",
```

Run to confirm it fails:

```bash
cd vanta-ts && npx vitest run src/tools/tools.test.ts 2>&1 | tail -10
```

Expected: FAIL — registry missing "roadmap_move"

- [ ] **Step 2: Create `tools/roadmap-move.ts`**

```typescript
import { z } from "zod";
import { STATUS } from "../roadmap/schema.js";
import type { Tool } from "./types.js";

const Args = z.object({
  id: z.string().min(1),
  status: z.enum(STATUS),
});

export const roadmapMoveTool: Tool = {
  schema: {
    name: "roadmap_move",
    description:
      "Move a roadmap item to a new status. Updates roadmap.json and regenerates roadmap.html. " +
      "Valid statuses: shipped, building, next, horizon.",
    parameters: {
      type: "object",
      required: ["id", "status"],
      properties: {
        id: {
          type: "string",
          description: "The roadmap item ID (e.g. 'ND2', 'KANBAN').",
        },
        status: {
          type: "string",
          enum: ["shipped", "building", "next", "horizon"],
          description: "The target status.",
        },
      },
    },
  },
  describeForSafety: (args) =>
    `move roadmap item ${String(args.id ?? "")} to ${String(args.status ?? "")}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: `Invalid args: ${parsed.error.message}` };
    }
    const { id, status } = parsed.data;
    try {
      const { moveRoadmapItem } = await import("../roadmap/move.js");
      const item = await moveRoadmapItem(ctx.root, id, status);
      return { ok: true, output: `Moved ${item.id} → ${status}: ${item.title}` };
    } catch (err) {
      return { ok: false, output: err instanceof Error ? err.message : String(err) };
    }
  },
};
```

- [ ] **Step 3: Register in `tools/index.ts`**

Add the import after the `clarifyTool` import:

```typescript
import { clarifyTool } from "./clarify.js";
import { roadmapMoveTool } from "./roadmap-move.js";
```

Add to `ALL_TOOLS` after `clarifyTool`:

```typescript
  clarifyTool,
  roadmapMoveTool,
```

- [ ] **Step 4: Run registry test — expect pass**

```bash
cd vanta-ts && npx vitest run src/tools/tools.test.ts 2>&1 | tail -10
```

Expected: all registry tests pass

- [ ] **Step 5: Typecheck**

```bash
cd vanta-ts && npm run typecheck 2>&1
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add vanta-ts/src/tools/roadmap-move.ts vanta-ts/src/tools/index.ts vanta-ts/src/tools/tools.test.ts
git commit -m "feat(KANBAN): roadmap_move tool — kernel-gated, registered"
```

---

## Task 3: CLI subcommand

**Files:**
- Modify: `vanta-ts/src/cli/ops.ts`
- Modify: `vanta-ts/src/cli.ts`

- [ ] **Step 1: Update `runRoadmapCommand` in `cli/ops.ts`**

Change the function signature and add move dispatch. The existing build+open path stays unchanged.

Replace:

```typescript
export async function runRoadmapCommand(repoRoot: string): Promise<void> {
  const { buildRoadmap } = await import("../roadmap/build.js");
  const { execSync } = await import("node:child_process");
  const htmlPath = await buildRoadmap(repoRoot);
  execSync(`open "${htmlPath}"`);
  console.log(`  → opened ${htmlPath}`);
}
```

With:

```typescript
export async function runRoadmapCommand(repoRoot: string, args: string[] = []): Promise<void> {
  if (args[0] === "move") {
    const id = args[1];
    const status = args[2];
    if (!id || !status) {
      console.error("Usage: vanta roadmap move <id> <status>");
      console.error("  status: shipped | building | next | horizon");
      process.exit(1);
    }
    const { moveRoadmapItem } = await import("../roadmap/move.js");
    const { STATUS } = await import("../roadmap/schema.js");
    if (!(STATUS as readonly string[]).includes(status)) {
      console.error(`Invalid status '${status}'. Valid: ${STATUS.join(", ")}`);
      process.exit(1);
    }
    const item = await moveRoadmapItem(repoRoot, id, status as import("../roadmap/schema.js").Status);
    console.log(`  ✓ Moved ${item.id} → ${status}: ${item.title}`);
    return;
  }

  const { buildRoadmap } = await import("../roadmap/build.js");
  const { execSync } = await import("node:child_process");
  const htmlPath = await buildRoadmap(repoRoot);
  execSync(`open "${htmlPath}"`);
  console.log(`  → opened ${htmlPath}`);
}
```

- [ ] **Step 2: Update `cli.ts` — pass rest to runRoadmapCommand and update usage**

In `cli.ts`, change line:

```typescript
  if (cmd === "roadmap") return runRoadmapCommand(repoRoot);
```

To:

```typescript
  if (cmd === "roadmap") return runRoadmapCommand(repoRoot, rest);
```

In the usage string, replace:

```typescript
      "       vanta roadmap                      build roadmap.html from roadmap.json and open it",
```

With:

```typescript
      "       vanta roadmap                      build roadmap.html from roadmap.json and open it",
      "       vanta roadmap move <id> <status>   move an item (shipped|building|next|horizon)",
```

- [ ] **Step 3: Full test suite — expect all pass**

```bash
cd vanta-ts && npm test 2>&1 | tail -10
```

Expected: all tests pass (≥673 tests)

- [ ] **Step 4: Typecheck**

```bash
cd vanta-ts && npm run typecheck 2>&1
```

Expected: no errors

- [ ] **Step 5: End-to-end smoke test**

```bash
cd /Users/jasonpoindexter/Documents/GitHub/Vanta
node vanta-ts/src/cli.ts roadmap move ND2 building 2>&1
```

Expected output: `  ✓ Moved ND2 → building: clarify tool (ask before acting)`

Then restore:

```bash
node vanta-ts/src/cli.ts roadmap move ND2 shipped 2>&1
```

Expected: `  ✓ Moved ND2 → shipped: clarify tool (ask before acting)`

- [ ] **Step 6: Commit**

```bash
git add vanta-ts/src/cli/ops.ts vanta-ts/src/cli.ts
git commit -m "feat(KANBAN): vanta roadmap move <id> <status> CLI subcommand"
```

---

## Self-Review

**Spec coverage:**
- ✓ `moveRoadmapItem` pure fn in `roadmap/move.ts`
- ✓ `roadmap_move` tool, kernel-gated via `describeForSafety`
- ✓ `vanta roadmap move <id> <status>` CLI
- ✓ Regenerates HTML after every move
- ✓ Unknown id → clear error message
- ✓ Invalid status → caught (Zod in tool; explicit check in CLI)
- ✓ Existing `vanta roadmap` (build+open) unchanged
- ✓ Slices 2 & 3 explicitly out of scope

**Placeholder scan:** None found.

**Type consistency:**
- `moveRoadmapItem` returns `Promise<RoadmapItem>` — used consistently in tool execute and CLI
- `STATUS` imported from `schema.ts` in both tool and CLI — same source of truth
- `Args` Zod schema uses `z.enum(STATUS)` — matches the `Status` type from schema
