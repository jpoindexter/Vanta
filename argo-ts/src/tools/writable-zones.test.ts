import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import { expandHome, resolveWritableZones, isInWritableZone } from "./writable-zones.js";

describe("expandHome", () => {
  it("expands a leading ~/ to the home dir", () => {
    expect(expandHome("~/Desktop")).toBe(join(homedir(), "Desktop"));
  });
  it("expands a bare ~", () => {
    expect(expandHome("~")).toBe(homedir());
  });
  it("leaves an absolute path untouched", () => {
    expect(expandHome("/tmp/x")).toBe("/tmp/x");
  });
});

describe("resolveWritableZones", () => {
  it("defaults to ~/Desktop and ~/Downloads", () => {
    const zones = resolveWritableZones({} as NodeJS.ProcessEnv);
    expect(zones).toContain(join(homedir(), "Desktop"));
    expect(zones).toContain(join(homedir(), "Downloads"));
  });

  it("ARGO_WRITABLE_DIRS replaces the defaults", () => {
    const zones = resolveWritableZones({ ARGO_WRITABLE_DIRS: "~/work, /tmp/out" } as NodeJS.ProcessEnv);
    expect(zones).toEqual([join(homedir(), "work"), "/tmp/out"]);
  });
});

describe("isInWritableZone", () => {
  const zones = [join(homedir(), "Desktop"), "/tmp/out"];

  it("accepts a file directly in a zone", () => {
    expect(isInWritableZone(join(homedir(), "Desktop", "a.txt"), zones)).toBe(true);
  });
  it("accepts a nested file in a zone", () => {
    expect(isInWritableZone(join(homedir(), "Desktop", "sub", "a.txt"), zones)).toBe(true);
  });
  it("rejects a path outside every zone", () => {
    expect(isInWritableZone(join(homedir(), ".ssh", "authorized_keys"), zones)).toBe(false);
  });
  it("rejects a prefix-collision sibling (Desktop-evil)", () => {
    expect(isInWritableZone(join(homedir(), "Desktop-evil", "a.txt"), zones)).toBe(false);
  });
});
