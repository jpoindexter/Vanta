import { describe, it, expect } from "vitest";
import { parseEnvArg, applySessionEnv, SessionEnvStore } from "./session-env.js";

describe("parseEnvArg", () => {
  it("parses KEY=value into a set action", () => {
    expect(parseEnvArg("API_KEY=abc123")).toEqual({ action: "set", key: "API_KEY", value: "abc123" });
  });

  it("trims surrounding whitespace around the whole argument", () => {
    expect(parseEnvArg("  FOO=bar  ")).toEqual({ action: "set", key: "FOO", value: "bar" });
  });

  it("keeps an empty value (KEY=) as a set to the empty string", () => {
    expect(parseEnvArg("DEBUG=")).toEqual({ action: "set", key: "DEBUG", value: "" });
  });

  it("keeps '=' characters inside the value", () => {
    expect(parseEnvArg("URL=https://x?a=1&b=2")).toEqual({ action: "set", key: "URL", value: "https://x?a=1&b=2" });
  });

  it("trims the whole argument, so inner leading space survives but outer trailing space is dropped", () => {
    // The slash arg is trimmed at the boundary; the value is everything after '='
    // in that trimmed string, so " hi " → " hi" (leading kept, trailing dropped).
    expect(parseEnvArg("MSG= hi ")).toEqual({ action: "set", key: "MSG", value: " hi" });
  });

  it("parses -KEY into an unset action", () => {
    expect(parseEnvArg("-API_KEY")).toEqual({ action: "unset", key: "API_KEY" });
  });

  it("trims whitespace after the dash for unset", () => {
    expect(parseEnvArg("- FOO ")).toEqual({ action: "unset", key: "FOO" });
  });

  it("treats an empty argument as list", () => {
    expect(parseEnvArg("")).toEqual({ action: "list" });
  });

  it("treats a whitespace-only argument as list", () => {
    expect(parseEnvArg("   ")).toEqual({ action: "list" });
  });

  it("rejects a malformed set with no '='", () => {
    const r = parseEnvArg("NOTANASSIGNMENT");
    expect(r.action).toBe("error");
  });

  it("rejects a set with an invalid key (leading digit)", () => {
    const r = parseEnvArg("1BAD=x");
    expect(r.action).toBe("error");
  });

  it("rejects a set with an invalid key (contains a dash)", () => {
    const r = parseEnvArg("BAD-KEY=x");
    expect(r.action).toBe("error");
  });

  it("rejects an unset with an invalid key", () => {
    const r = parseEnvArg("-1BAD");
    expect(r.action).toBe("error");
  });

  it("rejects a bare dash as unset of an empty key", () => {
    const r = parseEnvArg("-");
    expect(r.action).toBe("error");
  });
});

describe("applySessionEnv", () => {
  it("returns the base env UNCHANGED (same reference) when session env is empty", () => {
    const base = { PATH: "/usr/bin", HOME: "/home/me" } as NodeJS.ProcessEnv;
    const merged = applySessionEnv(base, {});
    expect(merged).toBe(base); // byte-identical: same object reference
  });

  it("merges session vars on top of the base", () => {
    const base = { PATH: "/usr/bin" } as NodeJS.ProcessEnv;
    const merged = applySessionEnv(base, { FOO: "bar" });
    expect(merged).toEqual({ PATH: "/usr/bin", FOO: "bar" });
  });

  it("session vars override base vars of the same key", () => {
    const base = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
    const merged = applySessionEnv(base, { NODE_ENV: "test" });
    expect(merged.NODE_ENV).toBe("test");
  });

  it("does not mutate the base env (non-mutating)", () => {
    const base = { PATH: "/usr/bin" } as NodeJS.ProcessEnv;
    const before = { ...base };
    applySessionEnv(base, { FOO: "bar", PATH: "/overridden" });
    expect(base).toEqual(before);
  });

  it("does not mutate the session env snapshot", () => {
    const base = { PATH: "/usr/bin" } as NodeJS.ProcessEnv;
    const session = Object.freeze({ FOO: "bar" });
    const merged = applySessionEnv(base, session);
    expect(merged).not.toBe(base);
    expect(session).toEqual({ FOO: "bar" });
  });
});

describe("SessionEnvStore", () => {
  it("starts empty", () => {
    const store = new SessionEnvStore();
    expect(store.size).toBe(0);
    expect(store.snapshot()).toEqual({});
  });

  it("sets and snapshots a var", () => {
    const store = new SessionEnvStore();
    store.set("FOO", "bar");
    expect(store.size).toBe(1);
    expect(store.snapshot()).toEqual({ FOO: "bar" });
  });

  it("replaces an existing var on set", () => {
    const store = new SessionEnvStore();
    store.set("FOO", "one");
    store.set("FOO", "two");
    expect(store.snapshot()).toEqual({ FOO: "two" });
  });

  it("unset removes a var and reports it existed", () => {
    const store = new SessionEnvStore();
    store.set("FOO", "bar");
    expect(store.unset("FOO")).toBe(true);
    expect(store.size).toBe(0);
  });

  it("unset of a missing var reports false", () => {
    const store = new SessionEnvStore();
    expect(store.unset("NOPE")).toBe(false);
  });

  it("clear empties the store", () => {
    const store = new SessionEnvStore();
    store.set("A", "1");
    store.set("B", "2");
    store.clear();
    expect(store.size).toBe(0);
  });

  it("the snapshot is frozen and independent of later mutations", () => {
    const store = new SessionEnvStore();
    store.set("FOO", "bar");
    const snap = store.snapshot();
    store.set("FOO", "changed");
    expect(snap).toEqual({ FOO: "bar" }); // snapshot is a point-in-time copy
  });
});
