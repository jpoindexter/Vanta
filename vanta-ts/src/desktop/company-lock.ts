// The company stores are plain files read, changed and rewritten in whole
// (tickets.json, work-products.json, budgets.json). A worker finishing in the
// background and an owner request can interleave and either tear a read or lose
// an update. One FIFO mutex per Vanta home serialises every company read, write
// and run completion. It is never held while waiting for a human approval or
// for a worker to run.

const tails = new Map<string, Promise<unknown>>();

export async function withCompanyLock<T>(home: string, fn: () => Promise<T>): Promise<T> {
  const previous = tails.get(home) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(fn);
  const tail = run.catch(() => undefined);
  tails.set(home, tail);
  try {
    return await run;
  } finally {
    if (tails.get(home) === tail) tails.delete(home);
  }
}
