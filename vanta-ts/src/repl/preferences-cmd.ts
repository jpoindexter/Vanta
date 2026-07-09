import { exportPreferenceSignalsJsonl } from "../preferences/signals.js";
import {
  addBeliefToStore,
  evidence,
  formatBeliefList,
  loadBeliefStore,
  rejectBeliefInStore,
  reviseBeliefInStore,
  saveBeliefStore,
} from "../operator-profile/beliefs.js";
import type { SlashHandler } from "./types.js";

export const preferences: SlashHandler = async (arg, ctx) => {
  const input = arg.trim();
  if (!input || input === "list") return { output: formatBeliefList(await loadBeliefStore(ctx.env)) };
  if (input === "export") return exportSignals(ctx.env);
  const add = input.match(/^add\s+(.+)$/s);
  if (add?.[1]) return addBelief(add[1], ctx);
  const correct = input.match(/^correct\s+(\S+)\s+(.+)$/s);
  if (correct?.[1] && correct[2]) return correctBelief(correct[1], correct[2], ctx);
  const reject = input.match(/^reject\s+(\S+)$/);
  if (reject?.[1]) return rejectBelief(reject[1], ctx);
  return { output: usage() };
};

async function exportSignals(env: NodeJS.ProcessEnv) {
  const exported = await exportPreferenceSignalsJsonl(env);
  const body = exported.content.trim();
  return { output: `  ⤓ ${exported.path}\n${body ? `${body}\n` : "  (no preference signals yet)"}` };
}

async function addBelief(statement: string, ctx: Parameters<SlashHandler>[1]) {
  const store = await loadBeliefStore(ctx.env);
  const now = ctx.now();
  const belief = addBeliefToStore(store, {
    statement,
    facet: "preferences",
    status: "accepted",
    confidence: 1,
    evidence: evidence({ kind: "self_report", sourceRef: `session:${ctx.state.sessionId}:command`, excerpt: statement }, now),
  }, { now });
  await saveBeliefStore(store, ctx.env);
  return { output: `  ✓ accepted belief ${belief.id}: ${belief.statement}` };
}

async function correctBelief(id: string, statement: string, ctx: Parameters<SlashHandler>[1]) {
  const store = await loadBeliefStore(ctx.env);
  const now = ctx.now();
  const belief = reviseBeliefInStore(store, id, {
    statement,
    status: "accepted",
    confidence: 1,
    evidence: evidence({ kind: "correction", sourceRef: `session:${ctx.state.sessionId}:command`, excerpt: statement }, now),
  }, { now });
  if (!belief) return { output: `  belief not found or inactive: ${id}` };
  await saveBeliefStore(store, ctx.env);
  return { output: `  ✓ corrected ${id} → ${belief.id}: ${belief.statement}` };
}

async function rejectBelief(id: string, ctx: Parameters<SlashHandler>[1]) {
  const store = await loadBeliefStore(ctx.env);
  const now = ctx.now();
  const belief = rejectBeliefInStore(
    store,
    id,
    evidence({ kind: "correction", sourceRef: `session:${ctx.state.sessionId}:command`, excerpt: "Operator rejected this belief" }, now),
    { now },
  );
  if (!belief) return { output: `  belief not found or inactive: ${id}` };
  await saveBeliefStore(store, ctx.env);
  return { output: `  ✓ rejected belief ${id}` };
}

function usage(): string {
  return "  usage: /preferences [list | add <belief> | correct <id> <belief> | reject <id> | export]";
}
