import {
  contextForDepartment,
  listHandoffs,
  readHandoffs,
  recordHandoff,
  writeHandoffs,
  type GetArtifact,
  type HandoffEdge,
  type InjectedContext,
} from "../cofounder/handoff.js";
import { getWorkProduct, readWorkProducts } from "../cofounder/work-products.js";

// `vanta handoff add <workProductId> <fromDept> <toDept>` / `list` / `context <toDept>`.
// A hand-off edge binds an APPROVED work product to a downstream department; the
// downstream department's next task resolves its context by following every inbound
// edge to its upstream artifact — but only approved, still-resolvable ones. Handlers
// are pure over injected deps so the whole surface is unit-tested without real I/O.

export type HandoffDeps = {
  readHandoffs: () => Promise<HandoffEdge[]>;
  writeHandoffs: (list: HandoffEdge[]) => Promise<void>;
  /** Resolve a work product id → its injected content + approval state (null if unknown). */
  getArtifact: GetArtifact;
  log: (line: string) => void;
  now?: () => Date;
};

const USAGE = [
  "usage:",
  "  vanta handoff add <workProductId> <fromDept> <toDept>",
  "  vanta handoff list",
  "  vanta handoff context <toDept>",
].join("\n");

/** `handoff add` — declare that an approved artifact feeds a downstream department. */
export async function handleHandoffAdd(
  workProductId: string,
  fromDept: string,
  toDept: string,
  deps: HandoffDeps,
): Promise<number> {
  const existing = await deps.readHandoffs();
  const created = recordHandoff(existing, { workProductId, fromDept, toDept }, (deps.now ?? (() => new Date()))());
  if (!created.ok) {
    deps.log(created.error);
    return 1;
  }
  const edge = created.value;
  await deps.writeHandoffs([...existing, edge]);
  deps.log(`handed off ${edge.workProductId}: ${edge.fromDepartment} → ${edge.toDepartment} (${edge.id})`);
  return 0;
}

/** Render one hand-off edge as a text line. Pure. */
export function formatHandoff(edge: HandoffEdge): string {
  return `${edge.id} · ${edge.workProductId} · ${edge.fromDepartment} → ${edge.toDepartment}`;
}

/** `handoff list` — every recorded edge, newest-first. */
export async function handleHandoffList(deps: HandoffDeps): Promise<number> {
  const list = listHandoffs(await deps.readHandoffs());
  if (list.length === 0) {
    deps.log("no hand-offs — declare one with: vanta handoff add <workProductId> <fromDept> <toDept>");
    return 0;
  }
  for (const edge of list) deps.log(formatHandoff(edge));
  return 0;
}

/** Render the resolved injected context for a department as text lines. Pure. */
export function formatContext(toDept: string, ctx: InjectedContext[]): string {
  if (ctx.length === 0) {
    return `no injected context for ${toDept} — no approved upstream artifacts handed off`;
  }
  const head = `injected context for ${toDept} · ${ctx.length} artifact(s):`;
  const blocks = ctx.map((c) => `  ◂ ${c.workProductId} (from ${c.fromDepartment})\n    ${c.content}`);
  return [head, ...blocks].join("\n");
}

/** `handoff context <toDept>` — the approved upstream artifacts injected into that department's next task. */
export async function handleHandoffContext(toDept: string, deps: HandoffDeps): Promise<number> {
  const edges = await deps.readHandoffs();
  const ctx = contextForDepartment(toDept, edges, deps.getArtifact);
  deps.log(formatContext(toDept, ctx));
  return 0;
}

/** Dispatch a parsed `vanta handoff <sub>` against injected deps. Pure orchestration. */
export async function handleHandoff(rest: string[], deps: HandoffDeps): Promise<number> {
  const [sub, ...args] = rest;
  switch (sub) {
    case "add": {
      const [workProductId, fromDept, toDept] = args;
      if (workProductId === undefined || fromDept === undefined || toDept === undefined) {
        deps.log(`add needs <workProductId> <fromDept> <toDept>\n${USAGE}`);
        return 1;
      }
      return handleHandoffAdd(workProductId, fromDept, toDept, deps);
    }
    case "list":
      return handleHandoffList(deps);
    case "context": {
      const [toDept] = args;
      if (toDept === undefined) {
        deps.log(`context needs a <toDept>\n${USAGE}`);
        return 1;
      }
      return handleHandoffContext(toDept, deps);
    }
    default:
      deps.log(USAGE);
      return sub ? 1 : 0;
  }
}

/** Build live deps: hand-offs + work products both in `~/.vanta`; the resolver reads the artifact library. */
async function liveHandoffDeps(): Promise<HandoffDeps> {
  const products = await readWorkProducts();
  const getArtifact: GetArtifact = (workProductId) => {
    const wp = getWorkProduct(products, workProductId);
    return wp ? { content: wp.artifact, approved: wp.approved } : null;
  };
  return {
    readHandoffs: () => readHandoffs(),
    writeHandoffs: (list) => writeHandoffs(list),
    getArtifact,
    log: (line) => console.log(line),
  };
}

export async function runHandoffCommand(rest: string[]): Promise<number> {
  return handleHandoff(rest, await liveHandoffDeps());
}
