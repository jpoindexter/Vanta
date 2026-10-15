import { createHash, randomUUID } from "node:crypto";
import { CaptureContinuitySchema, ContinuityActionSchema, type ContinuityAction, type ContinuityItem, type ContinuitySnapshot, type ContinuityStore } from "./types.js";
import { effectiveNdSupport } from "../nd/profile.js";
import { actionSha256, buildContinuityItem, captureSource, executePreparedRead, mentionedSourcePath } from "./item.js";
import { buildContinuitySnapshot } from "./snapshot.js";
import {
  ContinuityStoreUnreadableError,
  continuityStorePath,
  readContinuityStore,
  withContinuityLock,
  writeContinuityStore,
} from "./persistence.js";

export { continuityStorePath } from "./persistence.js";
export type { ContinuitySnapshot } from "./types.js";

type ContinuityDeps = {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  id?: () => string;
  sessionOff?: boolean;
  refusalScope?: "session" | "pattern" | "global";
};

const depsWithDefaults = (deps: ContinuityDeps) => ({
  env: deps.env ?? process.env,
  now: deps.now ?? (() => new Date()),
  id: deps.id ?? randomUUID,
  sessionOff: deps.sessionOff,
  refusalScope: deps.refusalScope,
});

async function snapshot(root: string, store: ContinuityStore, deps: ReturnType<typeof depsWithDefaults>) {
  return buildContinuitySnapshot(root, store, {
    env: deps.env,
    now: deps.now(),
    sessionOff: deps.sessionOff,
    refusalScope: deps.refusalScope,
  });
}

export async function loadContinuitySnapshot(root: string, input: ContinuityDeps = {}): Promise<ContinuitySnapshot> {
  const deps = depsWithDefaults(input);
  try { return snapshot(root, await readContinuityStore(root), deps); }
  catch (error) {
    if (!(error instanceof ContinuityStoreUnreadableError)) throw error;
    const empty: ContinuityStore = { version: 1, revision: 0, items: [], runs: [], approvals: [], receipts: [] };
    return buildContinuitySnapshot(root, empty, {
      env: deps.env,
      now: deps.now(),
      sessionOff: deps.sessionOff,
      refusalScope: deps.refusalScope,
      diagnostics: [{
        code: "continuity_store_unreadable",
        message: error.message,
        recovery: `Inspect ${continuityStorePath(root)}; Vanta left it untouched.`,
      }],
    });
  }
}

export async function captureContinuityItem(
  root: string,
  raw: unknown,
  input: ContinuityDeps = {},
): Promise<{ item: ContinuityItem; snapshot: ContinuitySnapshot }> {
  const parsed = CaptureContinuitySchema.parse(raw);
  const deps = depsWithDefaults(input);
  const item = await withContinuityLock(root, async () => {
    const store = await readContinuityStore(root);
    const now = deps.now();
    const at = now.toISOString();
    const sourcePath = parsed.sourcePath ?? mentionedSourcePath(parsed.text);
    const support = await effectiveNdSupport(deps.env, now);
    const next = buildContinuityItem({
      ...parsed,
      capacity: { ...support.capacity, ...parsed.capacity },
    }, await captureSource(root, sourcePath), deps.id(), at);
    await writeContinuityStore(root, { ...store, revision: store.revision + 1, items: [...store.items, next] });
    return next;
  });
  return { item, snapshot: await loadContinuitySnapshot(root, { ...input, env: deps.env, now: deps.now }) };
}

function itemIndex(store: ContinuityStore, id: string): number {
  const index = store.items.findIndex((item) => item.id === id);
  if (index < 0) throw new Error(`no continuity item "${id}"`);
  return index;
}

function replaceItem(store: ContinuityStore, index: number, item: ContinuityItem): ContinuityStore {
  const items = [...store.items];
  items[index] = item;
  return { ...store, revision: store.revision + 1, items };
}

async function beginRead(root: string, store: ContinuityStore, index: number, at: string): Promise<{ store: ContinuityStore; runId: string }> {
  const item = store.items[index]!;
  const runId = `${item.id}:prepared-read`;
  const running = { ...item, state: "running" as const, owner: "Vanta", blocker: "Reading the approved local source", updatedAt: at };
  const next = replaceItem(store, index, running);
  next.runs = [...next.runs, { version: 1, id: runId, workItemId: item.id, state: "running", actor: "desktop:continuity", startedAt: at }];
  next.approvals = [...next.approvals, {
    version: 1, id: `${runId}:approval`, workItemId: item.id, runId,
    actionSha256: actionSha256(item), state: "approved", at,
  }];
  await writeContinuityStore(root, next);
  return { store: next, runId };
}

async function finishRead(root: string, store: ContinuityStore, index: number, runId: string, at: string): Promise<{ store: ContinuityStore; item: ContinuityItem }> {
  const current = store.items[index]!;
  const result = await executePreparedRead(root, current);
  const item: ContinuityItem = {
    ...current,
    state: "waiting",
    owner: "operator",
    waitCondition: "Continue when you are ready",
    nextAction: result.nextAction,
    resumeContext: `Last verified ${at}: ${result.nextAction}. The source hash is ${result.sha256}.`,
    blocker: "Waiting for the operator",
    artifacts: [...current.artifacts, { kind: "note", ref: `continuity:${current.id}:prepared`, sha256: result.sha256 }],
    lastVerified: { state: "waiting", at, evidence: `sha256:${result.sha256}` },
    updatedAt: at,
  };
  const next = replaceItem(store, index, item);
  next.runs = next.runs.map((run) => run.id === runId ? { ...run, state: "waiting", settledAt: at } : run);
  next.receipts = [...next.receipts, {
    version: 1, id: `${runId}:receipt`, workItemId: item.id, runId,
    action: "continuity.read_local_source", disposition: "confirmed", verification: "verified",
    evidence: `sha256:${result.sha256}`, at,
  }];
  await writeContinuityStore(root, next);
  return { store: next, item };
}

async function doIt(root: string, store: ContinuityStore, index: number, deps: ReturnType<typeof depsWithDefaults>) {
  const item = store.items[index]!;
  const existing = store.receipts.find((receipt) => receipt.workItemId === item.id && receipt.action === "continuity.read_local_source");
  if (existing) return { store, item, receipt: existing, replayed: true };
  const orphan = store.runs.find((run) => run.workItemId === item.id && run.id.endsWith(":prepared-read"));
  if (orphan) throw new Error("the prior prepared read did not settle; review the retained run before retrying");
  const at = deps.now().toISOString();
  const begun = await beginRead(root, store, index, at);
  const finished = await finishRead(root, begun.store, index, begun.runId, at);
  return { ...finished, receipt: finished.store.receipts.at(-1), replayed: false };
}

async function settleLocalAction(root: string, store: ContinuityStore, index: number, action: ContinuityAction, at: string) {
  const current = store.items[index]!;
  const skipped = action.action === "skip";
  const item: ContinuityItem = skipped ? {
    ...current, state: "stopped", owner: "operator", blocker: "Skipped without penalty",
    waitCondition: "Skipped", resumeContext: "This item was skipped. It can be recaptured later.", updatedAt: at,
  } : {
    ...current, state: "waiting", owner: "operator", blocker: "Snoozed",
    waitCondition: "Snooze elapsed", followUp: { at: action.action === "snooze" ? action.until : undefined, condition: "Snooze elapsed" },
    resumeContext: `Snoozed until ${action.action === "snooze" ? action.until : at}; continue with ${current.nextAction}.`, updatedAt: at,
  };
  const next = replaceItem(store, index, item);
  const runId = `${item.id}:${action.action}:${next.revision}`;
  const receipt = {
    version: 1 as const, id: `${runId}:receipt`, workItemId: item.id, runId,
    action: `continuity.${action.action}`, disposition: skipped ? "denied" as const : "confirmed" as const,
    verification: "verified" as const, evidence: skipped ? "operator skipped" : `follow-up:${item.followUp.at}`, at,
  };
  next.runs = [...next.runs, { version: 1, id: runId, workItemId: item.id, state: item.state, actor: "desktop:continuity", startedAt: at, settledAt: at }];
  next.receipts = [...next.receipts, receipt];
  await writeContinuityStore(root, next);
  return { store: next, item, receipt, replayed: false };
}

type PublicActionResult = {
  item: ContinuityItem;
  snapshot: ContinuitySnapshot;
  replayed: boolean;
  preview?: string;
  receipt?: ContinuityStore["receipts"][number];
};

export async function applyContinuityAction(
  root: string,
  id: string,
  raw: unknown,
  input: ContinuityDeps = {},
): Promise<PublicActionResult> {
  const action = ContinuityActionSchema.parse(raw);
  const deps = depsWithDefaults(input);
  if (action.action === "show_me") {
    const store = await readContinuityStore(root);
    const item = store.items[itemIndex(store, id)]!;
    return { item, preview: item.preparedAction.preview, snapshot: await snapshot(root, store, deps), replayed: false };
  }
  const result = await withContinuityLock(root, async () => {
    const store = await readContinuityStore(root);
    const index = itemIndex(store, id);
    return action.action === "do_it"
      ? doIt(root, store, index, deps)
      : settleLocalAction(root, store, index, action, deps.now().toISOString());
  });
  const { store, ...publicResult } = result;
  return { ...publicResult, snapshot: await snapshot(root, store, deps) };
}

export function hashContinuityPayload(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
