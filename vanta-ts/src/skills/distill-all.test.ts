import { describe, it, expect } from "vitest";
import {
  bodyHash,
  readStampedHash,
  stampDistilled,
  isUpToDate,
  distillAll,
  formatDistillReport,
  type DistillAllDeps,
  type DistillTarget,
} from "./distill-all.js";

describe("distill-all pure helpers", () => {
  it("bodyHash is stable for the same body and differs for different bodies", () => {
    expect(bodyHash("hello")).toBe(bodyHash("hello"));
    expect(bodyHash("hello")).not.toBe(bodyHash("world"));
  });

  it("stampDistilled prepends a hash readStampedHash recovers", () => {
    const stamped = stampDistilled("the body", "## Examples\n1. x");
    expect(readStampedHash(stamped)).toBe(bodyHash("the body"));
    expect(stamped).toContain("## Examples");
  });

  it("readStampedHash returns null for unstamped content", () => {
    expect(readStampedHash("## Examples\n1. x")).toBeNull();
    expect(readStampedHash("")).toBeNull();
  });

  it("isUpToDate is true only when the stored hash matches the current body", () => {
    const body = "skill body v1";
    const stamped = stampDistilled(body, "## Examples");
    expect(isUpToDate(body, stamped)).toBe(true);
    expect(isUpToDate("skill body v2", stamped)).toBe(false);
    expect(isUpToDate(body, null)).toBe(false);
    expect(isUpToDate(body, "## Examples")).toBe(false); // unstamped
  });

  it("formatDistillReport counts each status", () => {
    const report = formatDistillReport([
      { name: "a", status: "distilled" },
      { name: "b", status: "skipped" },
      { name: "c", status: "distilled" },
      { name: "d", status: "failed" },
    ]);
    expect(report).toContain("Distilled 2");
    expect(report).toContain("skipped 1");
    expect(report).toContain("1 failed");
    expect(report).toContain("of 4");
  });
});

/** In-memory deps: an injected store + a deterministic distiller, no fs/provider/network. */
function makeDeps(opts: {
  targets: DistillTarget[];
  distill?: (t: DistillTarget) => Promise<string | null>;
}): { deps: DistillAllDeps; store: Map<string, string>; calls: string[] } {
  const store = new Map<string, string>();
  const calls: string[] = [];
  const deps: DistillAllDeps = {
    list: async () => opts.targets,
    distill: async (t) => {
      calls.push(t.name);
      return opts.distill ? opts.distill(t) : `## Examples\n1. ${t.name}`;
    },
    readExisting: async (name) => store.get(name) ?? null,
    writeOut: async (name, content) => void store.set(name, content),
  };
  return { deps, store, calls };
}

describe("distillAll orchestration (injected deps)", () => {
  it("distills every installed skill and stamps each output with its body hash", async () => {
    const targets = [
      { name: "Deploy Flow", body: "long deploy body" },
      { name: "Build Step", body: "long build body" },
    ];
    const { deps, store } = makeDeps({ targets });

    const out = await distillAll(deps);

    expect(out.map((o) => o.status)).toEqual(["distilled", "distilled"]);
    expect(readStampedHash(store.get("Deploy Flow")!)).toBe(bodyHash("long deploy body"));
    expect(store.get("Build Step")).toContain("## Examples");
  });

  it("is idempotent — a second pass skips up-to-date skills without re-distilling", async () => {
    const targets = [{ name: "Deploy Flow", body: "long deploy body" }];
    const { deps, calls } = makeDeps({ targets });

    const first = await distillAll(deps);
    expect(first.map((o) => o.status)).toEqual(["distilled"]);
    expect(calls).toEqual(["Deploy Flow"]);

    const second = await distillAll(deps);
    expect(second.map((o) => o.status)).toEqual(["skipped"]);
    expect(calls).toEqual(["Deploy Flow"]); // no second distill call
  });

  it("re-distills when the skill body changed since the last pass", async () => {
    const target = { name: "Deploy Flow", body: "v1 body" };
    const { deps, calls } = makeDeps({ targets: [target] });
    await distillAll(deps);

    target.body = "v2 body changed";
    const out = await distillAll(deps);

    expect(out.map((o) => o.status)).toEqual(["distilled"]);
    expect(calls).toEqual(["Deploy Flow", "Deploy Flow"]); // distilled twice
  });

  it("reports failed (not written) when the distiller returns null", async () => {
    const { deps, store } = makeDeps({
      targets: [{ name: "Empty", body: "body" }],
      distill: async () => null,
    });

    const out = await distillAll(deps);

    expect(out.map((o) => o.status)).toEqual(["failed"]);
    expect(store.has("Empty")).toBe(false);
  });

  it("a thrown distiller error fails only that skill, not the batch", async () => {
    const { deps } = makeDeps({
      targets: [
        { name: "Good", body: "a" },
        { name: "Bad", body: "b" },
        { name: "AlsoGood", body: "c" },
      ],
      distill: async (t) => {
        if (t.name === "Bad") throw new Error("provider blew up");
        return `## Examples\n1. ${t.name}`;
      },
    });

    const out = await distillAll(deps);

    expect(out.map((o) => `${o.name}:${o.status}`)).toEqual([
      "Good:distilled",
      "Bad:failed",
      "AlsoGood:distilled",
    ]);
  });
});
