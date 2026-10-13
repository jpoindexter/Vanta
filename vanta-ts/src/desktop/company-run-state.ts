// In-process run bookkeeping: which task runs are in flight, and the last
// sign of life per worker. Both are keyed by Vanta home so isolated homes (and
// tests) never share state. Durable history lives in company-runs.jsonl.

const inflight = new Map<string, Promise<void>>();
const beats = new Map<string, string>();

const key = (home: string, id: string): string => `${home}\u0000${id}`;

export function trackRun(home: string, taskId: string, done: Promise<void>): void {
  const tracked: Promise<void> = done.catch(() => undefined).finally(() => {
    if (inflight.get(key(home, taskId)) === tracked) inflight.delete(key(home, taskId));
  });
  inflight.set(key(home, taskId), tracked);
}

export const isRunning = (home: string, taskId: string): boolean => inflight.has(key(home, taskId));

export function runningTaskIds(home: string): string[] {
  const prefix = `${home}\u0000`;
  return [...inflight.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
}

export function touchWorker(home: string, workerId: string, at: Date): void {
  beats.set(key(home, workerId), at.toISOString());
}

export const workerBeat = (home: string, workerId: string): string | undefined => beats.get(key(home, workerId));

/** Resolves when no run is in flight (a finishing run may start the worker's next one). */
export async function settleRuns(): Promise<void> {
  while (inflight.size) await Promise.allSettled([...inflight.values()]);
}
