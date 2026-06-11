import { exec } from "node:child_process";
import {
  saveDef,
  loadDef,
  listDefs,
  saveState,
  loadState,
  removeLoop,
} from "../loop/store.js";
import { newState } from "../loop/types.js";
import {
  markInProgress,
  loopStateReminder,
  clearEscalation,
  openEscalations,
} from "../loop/state.js";
import { runLoopIteration } from "../loop/runner.js";
import { dataDirFor, buildCronRunTask } from "./ops.js";
import {
  parseTrigger,
  triggerSummary,
  slugifyGoal,
  uniqueId,
  buildLoopDef,
  assertValidId,
} from "./loop-cmd-build.js";

// `vanta loop <subcommand>` — manage first-class loops.
// Each handler stays under the fn size gate; helpers live in loop-cmd-build.ts.

async function handleAdd(root: string, rest: string[]): Promise<number> {
  const goalIdx = rest.indexOf("add") + 1;
  const goal = rest[goalIdx];
  if (!goal) {
    console.error("usage: vanta loop add \"<goal>\" [--id <id>] [--trigger <spec>]");
    return 1;
  }

  const idFlagIdx = rest.indexOf("--id");
  const triggerFlagIdx = rest.indexOf("--trigger");
  const rawTrigger = triggerFlagIdx >= 0 ? rest[triggerFlagIdx + 1] : "heartbeat";
  const requestedId = idFlagIdx >= 0 ? rest[idFlagIdx + 1] : undefined;

  let trigger;
  try { trigger = parseTrigger(rawTrigger ?? "heartbeat"); }
  catch (e: unknown) { console.error(e instanceof Error ? e.message : String(e)); return 1; }

  const dataDir = dataDirFor(root);
  const baseId = requestedId ?? slugifyGoal(goal);
  const id = await uniqueId(baseId, dataDir);
  assertValidId(id);

  const def = buildLoopDef(id, goal, trigger);
  await saveDef(dataDir, def);
  await saveState(dataDir, newState(id));
  console.log(`registered loop ${id} (${triggerSummary(trigger)})`);
  return 0;
}

async function handleList(root: string): Promise<number> {
  const dataDir = dataDirFor(root);
  const defs = await listDefs(dataDir);
  if (!defs.length) { console.log("no loops registered"); return 0; }
  for (const def of defs) {
    const state = await loadState(dataDir, def.id);
    const last = state.lastScore != null ? String(state.lastScore) : "-";
    console.log(
      `${def.id.padEnd(32)}  ${def.status.padEnd(8)}  ${triggerSummary(def.trigger).padEnd(24)}  iter=${state.iterations}  last=${last}`,
    );
  }
  return 0;
}

/** Resolves a gate shell command to boolean via exit code. */
function makeRunGate(): (cmd: string) => Promise<boolean> {
  return (cmd) =>
    new Promise((resolve) => {
      exec(cmd, (err) => resolve(!err));
    });
}

async function handleRun(root: string, id: string): Promise<number> {
  const dataDir = dataDirFor(root);
  const def = await loadDef(dataDir, id);
  if (!def) { console.error(`unknown loop: ${id}`); return 1; }

  const state = await loadState(dataDir, id);
  // Crash marker: if the process dies mid-run, the next wake sees inProgress:true
  // and can surface it as a recoverable condition rather than silently skipping.
  await saveState(dataDir, markInProgress(state, true));

  // Compute reminder once from the state captured at iteration start so the
  // goal + open blockers survive any compaction that happens inside the turn.
  const reminder = loopStateReminder(def, state);
  const runTask = buildCronRunTask(root);

  const runStage: import("../loop/types.js").RunStage = async ({ stage, goal, prior }) => {
    const base = [
      `Goal: ${goal}`,
      `Stage: ${stage.name}`,
      stage.prompt,
      prior ? `\nPrior context:\n${prior}` : "",
    ].filter(Boolean).join("\n");
    // Prepend reminder so the loop goal + blockers survive context compaction.
    const prompt = `${reminder}\n\n${base}`;
    return (await runTask(prompt)).finalText;
  };

  const result = await runLoopIteration(def, state, {
    runStage,
    now: () => new Date(),
    runGate: makeRunGate(),
  });

  await saveDef(dataDir, result.def);
  await saveState(dataDir, result.state);
  const scoreLabel = result.score != null ? String(result.score) : "n/a";
  console.log(`${result.reason}  score=${scoreLabel}`);
  return 0;
}

async function handleEscalations(root: string, id: string): Promise<number> {
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

async function handleClear(root: string, id: string, escId: string): Promise<number> {
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
  // Auto-resume: if the loop was paused and all blockers are gone, resume it.
  if (def.status === "paused" && openEscalations(next).length === 0) {
    await saveDef(dataDir, { ...def, status: "active" });
    console.log(`cleared ${escId} — loop resumed`);
  } else {
    console.log(`cleared ${escId}`);
  }
  return 0;
}

async function handlePause(root: string, id: string): Promise<number> {
  const dataDir = dataDirFor(root);
  const def = await loadDef(dataDir, id);
  if (!def) { console.error(`unknown loop: ${id}`); return 1; }
  await saveDef(dataDir, { ...def, status: "paused" });
  console.log(`paused loop ${id}`);
  return 0;
}

async function handleResume(root: string, id: string): Promise<number> {
  const dataDir = dataDirFor(root);
  const def = await loadDef(dataDir, id);
  if (!def) { console.error(`unknown loop: ${id}`); return 1; }
  await saveDef(dataDir, { ...def, status: "active" });
  console.log(`resumed loop ${id}`);
  return 0;
}

async function handleKill(root: string, id: string, purge: boolean): Promise<number> {
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

async function handleShow(root: string, id: string): Promise<number> {
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

const USAGE =
  "usage: vanta loop <add|list|run|pause|resume|kill|show|escalations|clear> [args]\n" +
  "  escalations <id>          list all escalations for a loop\n" +
  "  clear <id> <escId>        clear an open escalation (human-only; auto-resumes if unblocked)";

/** Validate `clear <id> <escId>` args then delegate. */
function dispatchClear(root: string, rest: string[]): Promise<number> {
  const id = rest[1];
  const escId = rest[2];
  if (!id || !escId) {
    console.error("usage: vanta loop clear <id> <escId>");
    return Promise.resolve(1);
  }
  return handleClear(root, id, escId);
}

/** Subcommands that require exactly one `<id>` arg (rest[1]). */
type IdHandler = (root: string, id: string, rest: string[]) => Promise<number>;

const ID_CMDS: Record<string, IdHandler> = {
  run: (r, id) => handleRun(r, id),
  pause: (r, id) => handlePause(r, id),
  resume: (r, id) => handleResume(r, id),
  kill: (r, id, rest) => handleKill(r, id, rest.includes("--purge")),
  show: (r, id) => handleShow(r, id),
  escalations: (r, id) => handleEscalations(r, id),
};

export async function runLoopCommand(root: string, rest: string[]): Promise<number> {
  const sub = rest[0];
  if (sub === "add") return handleAdd(root, rest);
  if (sub === "list") return handleList(root);
  if (sub === "clear") return dispatchClear(root, rest);
  const idCmd = sub ? ID_CMDS[sub] : undefined;
  if (idCmd) {
    const id = rest[1];
    if (!id) { console.error(`usage: vanta loop ${sub} <id>`); return 1; }
    return idCmd(root, id, rest);
  }
  console.error(USAGE);
  return 1;
}
