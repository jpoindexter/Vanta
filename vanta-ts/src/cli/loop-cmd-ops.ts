import { saveDef, loadDef, saveState, loadState, removeLoop } from "../loop/store.js";
import { clearEscalation, openEscalations } from "../loop/state.js";
import { dataDirFor } from "./ops.js";

// State-mutation handlers for `vanta loop`. Extracted from loop-cmd.ts (size gate).
// Core CRUD (add/list/run) stays in loop-cmd.ts.

export async function handleEscalations(root: string, id: string): Promise<number> {
  const dataDir = dataDirFor(root);
  const def = await loadDef(dataDir, id);
  if (!def) { console.error(`unknown loop: ${id}`); return 1; }
  const state = await loadState(dataDir, id);
  if (!state.escalations.length) { console.log("no escalations"); return 0; }
  for (const e of state.escalations) {
    console.log(`${e.id}  ${e.status}  ${e.reason}  (${e.raisedAt})`);
  }
  return 0;
}

export async function handleClear(root: string, id: string, escId: string): Promise<number> {
  const dataDir = dataDirFor(root);
  const def = await loadDef(dataDir, id);
  if (!def) { console.error(`unknown loop: ${id}`); return 1; }
  const state = await loadState(dataDir, id);
  const { state: next, cleared } = clearEscalation(state, escId, new Date());
  if (!cleared) {
    console.error(`no open escalation '${escId}' on ${id}`);
    return 1;
  }
  await saveState(dataDir, next);
  if (def.status === "paused" && openEscalations(next).length === 0) {
    await saveDef(dataDir, { ...def, status: "active" });
    console.log(`cleared ${escId} — loop resumed`);
  } else {
    console.log(`cleared ${escId}`);
  }
  return 0;
}

export async function handlePause(root: string, id: string): Promise<number> {
  const dataDir = dataDirFor(root);
  const def = await loadDef(dataDir, id);
  if (!def) { console.error(`unknown loop: ${id}`); return 1; }
  await saveDef(dataDir, { ...def, status: "paused" });
  console.log(`paused loop ${id}`);
  return 0;
}

export async function handleResume(root: string, id: string): Promise<number> {
  const dataDir = dataDirFor(root);
  const def = await loadDef(dataDir, id);
  if (!def) { console.error(`unknown loop: ${id}`); return 1; }
  await saveDef(dataDir, { ...def, status: "active" });
  console.log(`resumed loop ${id}`);
  return 0;
}

export async function handleKill(root: string, id: string, purge: boolean): Promise<number> {
  const dataDir = dataDirFor(root);
  const def = await loadDef(dataDir, id);
  if (!def) { console.error(`unknown loop: ${id}`); return 1; }
  if (purge) {
    await removeLoop(dataDir, id);
    console.log(`removed loop ${id}`);
  } else {
    await saveDef(dataDir, { ...def, status: "killed" });
    console.log(`killed loop ${id}`);
  }
  return 0;
}

export async function handleShow(root: string, id: string): Promise<number> {
  const dataDir = dataDirFor(root);
  const def = await loadDef(dataDir, id);
  if (!def) { console.error(`unknown loop: ${id}`); return 1; }
  const state = await loadState(dataDir, id);
  console.log(JSON.stringify(def, null, 2));
  const recent = state.history.slice(-5);
  if (recent.length) {
    console.log("\nLast iterations:");
    for (const h of recent) {
      console.log(`  ${h.at}  score=${h.score ?? "-"}  ${h.note}`);
    }
  }
  return 0;
}
