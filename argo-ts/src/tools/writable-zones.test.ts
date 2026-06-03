import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  expandHome,
  resolveWritableZones,
  resolveReadableZones,
  isInZone,
} from "./writable-zones.js";

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

describe("resolveReadableZones", () => {
  it("defaults to the project's parent dir plus the writable zones", () => {
    const root = "/Users/x/Documents/GitHub/Argo";
    const zones = resolveReadableZones({} as NodeJS.ProcessEnv, root);
    expect(zones).toContain(dirname(resolve(root))); // ~/Documents/GitHub → sibling repos readable
    expect(zones).toContain(join(homedir(), "Desktop"));
  });

  it("makes a sibling repo readable by default", () => {
    const root = "/Users/x/Documents/GitHub/Argo";
    const zones = resolveReadableZones({} as NodeJS.ProcessEnv, root);
    expect(isInZone("/Users/x/Documents/GitHub/theft-kit/design-html/SKILL.md", zones)).toBe(true);
  });

  it("ARGO_READABLE_DIRS replaces the defaults", () => {
    const zones = resolveReadableZones({ ARGO_READABLE_DIRS: "/srv/data" } as NodeJS.ProcessEnv, "/any/root");
    expect(zones).toEqual(["/srv/data"]);
  });
});

describe("isInZone", () => {
  const zones = [join(homedir(), "Desktop"), "/tmp/out"];

  it("accepts a file directly in a zone", () => {
    expect(isInZone(join(homedir(), "Desktop", "a.txt"), zones)).toBe(true);
  });
  it("accepts a nested file in a zone", () => {
    expect(isInZone(join(homedir(), "Desktop", "sub", "a.txt"), zones)).toBe(true);
  });
  it("rejects a path outside every zone", () => {
    expect(isInZone(join(homedir(), ".ssh", "authorized_keys"), zones)).toBe(false);
  });
  it("rejects a prefix-collision sibling (Desktop-evil)", () => {
    expect(isInZone(join(homedir(), "Desktop-evil", "a.txt"), zones)).toBe(false);
  });
});
