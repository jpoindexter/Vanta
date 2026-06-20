import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  expandHome,
  resolveWritableZones,
  resolveReadableZones,
  isInZone,
  resolveReadablePath,
  resolveWritablePath,
  isDangerousPath,
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

  it("VANTA_WRITABLE_DIRS replaces the defaults (scratchpad always appended)", () => {
    const zones = resolveWritableZones({ VANTA_WRITABLE_DIRS: "~/work, /tmp/out" } as NodeJS.ProcessEnv);
    // The configured dirs replace ~/Desktop/~/Downloads; the agent scratchpad
    // (a designated temp zone) is always present regardless of the override.
    expect(zones).toEqual([join(homedir(), "work"), "/tmp/out", join(homedir(), ".vanta", "scratch")]);
  });
});

describe("resolveReadableZones", () => {
  it("defaults to the project's parent dir plus the writable zones", () => {
    const root = "/Users/x/Documents/GitHub/Vanta";
    const zones = resolveReadableZones({} as NodeJS.ProcessEnv, root);
    expect(zones).toContain(dirname(resolve(root))); // ~/Documents/GitHub → sibling repos readable
    expect(zones).toContain(join(homedir(), "Desktop"));
  });

  it("makes a sibling repo readable by default", () => {
    const root = "/Users/x/Documents/GitHub/Vanta";
    const zones = resolveReadableZones({} as NodeJS.ProcessEnv, root);
    expect(isInZone("/Users/x/Documents/GitHub/theft-kit/design-html/SKILL.md", zones)).toBe(true);
  });

  it("VANTA_READABLE_DIRS replaces the defaults", () => {
    const zones = resolveReadableZones({ VANTA_READABLE_DIRS: "/srv/data" } as NodeJS.ProcessEnv, "/any/root");
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

describe("resolveReadablePath (shared read-path policy)", () => {
  const root = "/Users/x/Documents/GitHub/Vanta";

  it("accepts an in-root relative path", () => {
    const r = resolveReadablePath("src/a.ts", root, {} as NodeJS.ProcessEnv);
    expect(r).toEqual({ ok: true, abs: join(root, "src/a.ts") });
  });

  it("expands ~ before resolving so ~/Desktop is not bogusly in-root", () => {
    const r = resolveReadablePath("~/Desktop/x.png", root, {} as NodeJS.ProcessEnv);
    expect(r.ok).toBe(true);
    expect(r.abs).toBe(join(homedir(), "Desktop", "x.png")); // not <root>/~/Desktop/x.png
  });

  it("accepts an absolute path inside a configured readable zone", () => {
    const r = resolveReadablePath("/srv/data/x.png", root, { VANTA_READABLE_DIRS: "/srv/data" } as NodeJS.ProcessEnv);
    expect(r.ok).toBe(true);
  });

  it("refuses /etc/passwd as a dangerous path, not merely out-of-zone", () => {
    const r = resolveReadablePath("/etc/passwd", root, { VANTA_READABLE_DIRS: "/srv/data" } as NodeJS.ProcessEnv);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("never accessible");
  });
});

describe("isDangerousPath", () => {
  it("flags SSH/credential/cloud/system paths", () => {
    expect(isDangerousPath(join(homedir(), ".ssh", "id_rsa")).dangerous).toBe(true);
    expect(isDangerousPath("/etc/passwd").dangerous).toBe(true);
    expect(isDangerousPath(join(homedir(), ".aws", "credentials")).dangerous).toBe(true);
    expect(isDangerousPath(join(homedir(), ".config", "gcloud", "x.json")).dangerous).toBe(true);
    expect(isDangerousPath(join(homedir(), ".zshrc")).dangerous).toBe(true);
    expect(isDangerousPath(join(homedir(), ".vanta", "google-tokens.json")).dangerous).toBe(true);
  });
  it("does NOT flag ordinary repo or Desktop files", () => {
    expect(isDangerousPath("/Users/x/Documents/GitHub/Vanta/src/a.ts").dangerous).toBe(false);
    expect(isDangerousPath(join(homedir(), "Desktop", "note.txt")).dangerous).toBe(false);
    expect(isDangerousPath(join(homedir(), ".vanta", "skills", "x", "SKILL.md")).dangerous).toBe(false);
  });
  it("rejects a prefix-collision sibling of a protected dir", () => {
    expect(isDangerousPath(join(homedir(), ".ssh-backup", "id_rsa")).dangerous).toBe(false);
  });
});

describe("resolveWritablePath", () => {
  const root = "/Users/x/Documents/GitHub/Vanta";
  it("refuses a dangerous path before any zone/approval logic", () => {
    const r = resolveWritablePath("~/.ssh/id_rsa", root, {} as NodeJS.ProcessEnv);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("never writable");
  });
  it("accepts an in-root path", () => {
    expect(resolveWritablePath("src/a.ts", root, {} as NodeJS.ProcessEnv).ok).toBe(true);
  });
  it("accepts a ~/Desktop path (default writable zone)", () => {
    expect(resolveWritablePath("~/Desktop/x.md", root, {} as NodeJS.ProcessEnv).ok).toBe(true);
  });
  it("refuses an out-of-zone path", () => {
    const r = resolveWritablePath("/var/elsewhere/x", root, {} as NodeJS.ProcessEnv);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("writable zone");
  });
});
