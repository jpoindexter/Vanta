import { describe, expect, it } from "vitest";
import type { ReplCtx } from "./types.js";
import { buildCdHandler } from "./cd-cmd.js";

// The handler ignores ctx; an empty object satisfies the signature in tests.
const ctx = {} as ReplCtx;

/** A tiny in-memory cwd store mirroring the session-cwd holder, for the handler. */
function makeStore(initial: string) {
  let dir = initial;
  return {
    get: () => dir,
    set: (d: string) => {
      dir = d;
    },
  };
}

describe("/cd handler", () => {
  it("prints the current directory with no argument", async () => {
    const store = makeStore("/home/proj");
    const cd = buildCdHandler(store.get, store.set, () => true);
    const r = await cd("", ctx);
    expect(r.output).toContain("/home/proj");
    expect(store.get()).toBe("/home/proj");
  });

  it("prints the current directory for a whitespace-only argument", async () => {
    const store = makeStore("/home/proj");
    const cd = buildCdHandler(store.get, store.set, () => true);
    const r = await cd("   ", ctx);
    expect(r.output).toContain("/home/proj");
  });

  it("changes the directory for a valid relative path", async () => {
    const store = makeStore("/home/proj");
    const cd = buildCdHandler(store.get, store.set, () => true);
    const r = await cd("sub/dir", ctx);
    expect(store.get()).toBe("/home/proj/sub/dir");
    expect(r.output).toContain("/home/proj/sub/dir");
  });

  it("changes the directory for a valid absolute path", async () => {
    const store = makeStore("/home/proj");
    const cd = buildCdHandler(store.get, store.set, () => true);
    await cd("/var/log", ctx);
    expect(store.get()).toBe("/var/log");
  });

  it("does not change the directory for a non-existent path", async () => {
    const store = makeStore("/home/proj");
    const cd = buildCdHandler(store.get, store.set, () => false);
    const r = await cd("nope", ctx);
    expect(store.get()).toBe("/home/proj");
    expect(r.output).toMatch(/no such directory/);
  });

  it("resolves the new path against the current (already-changed) directory", async () => {
    const store = makeStore("/home/proj");
    const cd = buildCdHandler(store.get, store.set, () => true);
    await cd("a", ctx);
    await cd("b", ctx);
    expect(store.get()).toBe("/home/proj/a/b");
  });
});
