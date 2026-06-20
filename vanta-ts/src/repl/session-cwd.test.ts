import { afterEach, describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  resolveCdTarget,
  sessionCwd,
  setSessionCwd,
  isCwdChanged,
  resetSessionCwd,
} from "./session-cwd.js";

const allExist = () => true;
const noneExist = () => false;

describe("resolveCdTarget", () => {
  it("resolves a relative path against the current dir", () => {
    const r = resolveCdTarget("sub/dir", "/home/proj", allExist);
    expect(r).toEqual({ ok: true, dir: "/home/proj/sub/dir" });
  });

  it("uses an absolute path as-is (normalized)", () => {
    const r = resolveCdTarget("/var/log", "/home/proj", allExist);
    expect(r).toEqual({ ok: true, dir: "/var/log" });
  });

  it("normalizes a relative path with `..` against the current dir", () => {
    const r = resolveCdTarget("../sibling", "/home/proj/app", allExist);
    expect(r).toEqual({ ok: true, dir: "/home/proj/sibling" });
  });

  it("resolves `.` to the current dir", () => {
    const r = resolveCdTarget(".", "/home/proj", allExist);
    expect(r).toEqual({ ok: true, dir: "/home/proj" });
  });

  it("returns an error for a non-existent target", () => {
    const r = resolveCdTarget("missing", "/home/proj", noneExist);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("no such directory: /home/proj/missing");
  });

  it("returns an error for an empty argument", () => {
    const r = resolveCdTarget("", "/home/proj", allExist);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/expected a path/);
  });

  it("returns an error for whitespace-only argument", () => {
    const r = resolveCdTarget("   ", "/home/proj", allExist);
    expect(r.ok).toBe(false);
  });

  it("trims surrounding whitespace before resolving", () => {
    const r = resolveCdTarget("  sub  ", "/home/proj", allExist);
    expect(r).toEqual({ ok: true, dir: "/home/proj/sub" });
  });

  it("passes the resolved absolute path to the existence check", () => {
    let seen = "";
    resolveCdTarget("sub", "/home/proj", (d) => {
      seen = d;
      return true;
    });
    expect(seen).toBe("/home/proj/sub");
  });
});

describe("session-cwd store", () => {
  afterEach(() => resetSessionCwd());

  it("defaults to process.cwd() until changed", () => {
    expect(isCwdChanged()).toBe(false);
    expect(sessionCwd()).toBe(process.cwd());
  });

  it("reflects a set directory and marks it changed", () => {
    const target = resolve("/tmp/some-where");
    setSessionCwd(target);
    expect(isCwdChanged()).toBe(true);
    expect(sessionCwd()).toBe(target);
  });

  it("reset returns to the process cwd default", () => {
    setSessionCwd("/tmp/x");
    resetSessionCwd();
    expect(isCwdChanged()).toBe(false);
    expect(sessionCwd()).toBe(process.cwd());
  });
});
