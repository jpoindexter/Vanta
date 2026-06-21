/**
 * Plugin dependency resolution: apt-style presence guarantees with cycle
 * detection. A plugin's manifest may declare `dependsOn: [otherName, ...]`;
 * this module turns the declared edges into a correct LOAD ORDER (a dependency
 * loads before its dependent) and refuses — as a returned error, never a throw
 * — on a missing dependency or a dependency cycle.
 *
 * PURE. Nothing here spawns, reads the filesystem, or imports a plugin. The
 * live `loader.ts loadEnabledPlugins` would (when wired) call `parsePluginDeps`
 * per discovered/enabled plugin manifest, build `PluginNode[]`, call
 * `resolveLoadOrder(nodes)`, and load in `order` — refusing to load on
 * `{ok:false}` (cycle or missing dep) rather than loading in a broken order.
 * Today that loader iterates `enabled` insertion order with no dep awareness;
 * this module is the drop-in resolver for that wire.
 */

/** A plugin reduced to its dependency-relevant shape: a name + declared deps. */
export type PluginNode = {
  name: string;
  dependsOn: string[];
};

/** A declared dependency that isn't present in the node set. */
export type MissingDep = {
  plugin: string;
  missing: string;
};

/** A successful topological resolution: deps before dependents. */
export type LoadOrderOk = {
  ok: true;
  order: string[];
};

/**
 * A refused resolution. `kind` is `"missing"` (a declared dep isn't present)
 * or `"cycle"` (a dependency cycle). `detail` carries the offending name(s):
 * the missing dep name, or the cycle path (`a -> b -> a`).
 */
export type LoadOrderErr = {
  ok: false;
  kind: "missing" | "cycle";
  error: string;
  detail: string;
};

export type LoadOrderResult = LoadOrderOk | LoadOrderErr;

/**
 * Read an optional `dependsOn` array off a parsed plugin manifest (a plain
 * record; NOT routed through the strict `PluginManifestSchema`, which rejects
 * unknown keys — mirror `parsePluginLsp`). Absent / non-array / garbage → [].
 * Each entry must be a non-empty string; non-strings and blanks are dropped.
 * Self-references are dropped (a plugin can't depend on itself). Deduped,
 * order-preserving (first occurrence wins).
 */
export function parsePluginDeps(manifest: unknown): string[] {
  if (!manifest || typeof manifest !== "object") return [];
  const record = manifest as Record<string, unknown>;
  const raw = record.dependsOn;
  if (!Array.isArray(raw)) return [];
  const self = typeof record.name === "string" ? record.name.trim() : "";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const name = entry.trim();
    if (!name) continue;
    if (name === self) continue; // drop self-refs
    if (seen.has(name)) continue; // dedupe
    seen.add(name);
    out.push(name);
  }
  return out;
}

/** Declared deps that aren't present in the node set, per plugin (in order). */
export function missingDeps(nodes: PluginNode[]): MissingDep[] {
  const present = new Set(nodes.map((n) => n.name));
  const out: MissingDep[] = [];
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      if (!present.has(dep)) out.push({ plugin: node.name, missing: dep });
    }
  }
  return out;
}

/**
 * Detect a dependency cycle via DFS with a visiting (grey) set. Returns the
 * cycle path (`a -> b -> a`, closing back to the entry node) or null when the
 * graph is acyclic. A self-cycle (`a` declares `a`) returns `a -> a`. Edges to
 * absent deps are ignored here (those are `missingDeps`' concern). Roots are
 * scanned in input order so the reported cycle is stable.
 */
export function detectCycle(nodes: PluginNode[]): string[] | null {
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const visited = new Set<string>(); // black: fully explored, no cycle through it
  const stack: string[] = [];
  const onStack = new Set<string>(); // grey: on the current DFS path

  function visit(name: string): string[] | null {
    if (onStack.has(name)) {
      const from = stack.indexOf(name);
      return [...stack.slice(from), name]; // close the loop back to `name`
    }
    if (visited.has(name)) return null;
    const node = byName.get(name);
    if (!node) return null; // absent dep: not a cycle
    onStack.add(name);
    stack.push(name);
    for (const dep of node.dependsOn) {
      const found = visit(dep);
      if (found) return found;
    }
    stack.pop();
    onStack.delete(name);
    visited.add(name);
    return null;
  }

  for (const node of nodes) {
    const found = visit(node.name);
    if (found) return found;
  }
  return null;
}

/** First missing dep as a refusal, or null when every declared dep is present. */
function missingError(nodes: PluginNode[]): LoadOrderErr | null {
  const [first] = missingDeps(nodes);
  if (!first) return null;
  return {
    ok: false,
    kind: "missing",
    error: `plugin "${first.plugin}" depends on missing plugin "${first.missing}"`,
    detail: first.missing,
  };
}

/** A cycle as a refusal, or null when the graph is acyclic. */
function cycleError(nodes: PluginNode[]): LoadOrderErr | null {
  const cycle = detectCycle(nodes);
  if (!cycle) return null;
  const path = cycle.join(" -> ");
  return { ok: false, kind: "cycle", error: `plugin dependency cycle: ${path}`, detail: path };
}

/** dependents[dep] = nodes that declare `dep` (to decrement indegree on emit). */
function buildDependents(nodes: PluginNode[]): Map<string, string[]> {
  const dependents = new Map<string, string[]>();
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      const list = dependents.get(dep) ?? [];
      list.push(node.name);
      dependents.set(dep, list);
    }
  }
  return dependents;
}

/**
 * Kahn's topological sort, ties broken by INPUT ORDER. PRECONDITION: caller has
 * ruled out missing deps + cycles, so every node emits. Indegree = a node's own
 * (present) dependency count; a node is ready once all its deps have emitted.
 */
function kahnOrder(nodes: PluginNode[]): string[] {
  const indegree = new Map<string, number>();
  for (const node of nodes) indegree.set(node.name, node.dependsOn.length);
  const dependents = buildDependents(nodes);

  const order: string[] = [];
  const emitted = new Set<string>();
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const node of nodes) {
      if (emitted.has(node.name) || (indegree.get(node.name) ?? 0) !== 0) continue;
      emitted.add(node.name);
      order.push(node.name);
      progressed = true;
      for (const dependent of dependents.get(node.name) ?? []) {
        indegree.set(dependent, (indegree.get(dependent) ?? 0) - 1);
      }
    }
  }
  return order;
}

/**
 * Resolve a load order: a dependency loads before its dependent. Returns
 * `{ok:true, order}` on success, else `{ok:false, kind, error, detail}`:
 *   - missing: a declared dep isn't in `nodes` (detail = the dep name).
 *   - cycle:   a dependency cycle (detail = the cycle path).
 * Missing is checked first (a cycle through an absent node can't form anyway).
 *
 * Topological sort with input-order tie-breaking: a graph with no edges returns
 * the original order unchanged (current loader behavior). Never throws.
 */
export function resolveLoadOrder(nodes: PluginNode[]): LoadOrderResult {
  const refusal = missingError(nodes) ?? cycleError(nodes);
  if (refusal) return refusal;
  return { ok: true, order: kahnOrder(nodes) };
}
