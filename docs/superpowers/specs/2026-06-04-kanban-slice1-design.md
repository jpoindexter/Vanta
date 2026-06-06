# KANBAN Slice 1 — roadmap_move tool + CLI

Date: 2026-06-04
Branch: feat/v1-hermes-parity
Status: approved

## Goal

Allow Vanta (agent and user) to move roadmap items between statuses.
Updates `roadmap.json` and regenerates `roadmap.html`.

Done criteria: `argo roadmap move ND2 building` updates roadmap.json + regenerates HTML.

## Out of scope (slices 2 & 3)

- Drag-to-move HTML endpoint (slice 2)
- WIP limit enforcement (slice 3)

## Architecture

Pure function → thin tool wrapper → thin CLI wrapper. Matches existing patterns.

```
roadmap/move.ts          pure moveRoadmapItem() — read/validate/patch/write/rebuild
tools/roadmap-move.ts    Vanta tool wrapping moveRoadmapItem
cli/ops.ts               runRoadmapCommand updated to dispatch move subcommand
cli.ts                   pass rest[] to runRoadmapCommand
```

## Data contract

`roadmap.json` is Zod-validated on read (`RoadmapSchema`). Valid statuses: `shipped | building | next | horizon` (from `STATUS` const in `schema.ts`). On a successful move, two fields update:

- `items[n].status` → new value
- `updated` (top-level ISO date string) → today's date

`buildRoadmap(repoRoot)` is called after the write to regenerate `roadmap.html`.

## `roadmap/move.ts`

```ts
export async function moveRoadmapItem(
  repoRoot: string,
  id: string,
  toStatus: Status,
): Promise<RoadmapItem>
```

Steps:
1. Read + JSON.parse `roadmap.json`
2. `RoadmapSchema.parse()` — throws on malformed
3. Find item by `id` (case-sensitive, exact match)
4. If not found: throw `Error("no item with id '${id}' in roadmap.json")`
5. Mutate `item.status = toStatus`; mutate `data.updated = new Date().toISOString().slice(0,10)`
6. `writeFile` with `JSON.stringify(data, null, 2) + "\n"`
7. `buildRoadmap(repoRoot)` — regenerate HTML
8. Return the updated item

## `tools/roadmap-move.ts`

- Name: `roadmap_move`
- Params: `id: string` (required), `status: enum(STATUS)` (required)
- `describeForSafety`: `"move roadmap item ${id} to ${status}"` → kernel Allow
- `execute`: calls `moveRoadmapItem`, returns `{ok:true, output:"Moved ${id} → ${status}"}` on success; catches and returns `{ok:false, output: err.message}` on error

## CLI (`cli/ops.ts` + `cli.ts`)

`runRoadmapCommand(repoRoot: string, args: string[] = [])`:

```
argo roadmap                     → build + open (existing behaviour)
argo roadmap move <id> <status>  → move item, print result
```

`cli.ts` line 276 changes from `runRoadmapCommand(repoRoot)` to `runRoadmapCommand(repoRoot, rest)`.

Missing args (`argo roadmap move` with no id/status): print usage, exit 1.

## Tests

`roadmap/move.test.ts` (new):
- Happy path: moves item, verifies status + updated field in written JSON
- Unknown id returns error
- Invalid status caught by Zod before write (Zod enum parse fails)
- HTML file is regenerated (file exists after call)

`tools/tools.test.ts`:
- Add `"roadmap_move"` to sorted registry list

## Files touched

| File | Action |
|------|--------|
| `argo-ts/src/roadmap/move.ts` | create |
| `argo-ts/src/roadmap/move.test.ts` | create |
| `argo-ts/src/tools/roadmap-move.ts` | create |
| `argo-ts/src/tools/index.ts` | register roadmapMoveTool |
| `argo-ts/src/cli/ops.ts` | update runRoadmapCommand signature + move dispatch |
| `argo-ts/src/cli.ts` | pass rest to runRoadmapCommand |
| `argo-ts/src/tools/tools.test.ts` | add roadmap_move to registry list |
