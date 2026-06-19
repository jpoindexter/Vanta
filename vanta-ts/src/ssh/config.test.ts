import { describe, it, expect } from "vitest";
import { resolveSshProfile, sshTarget, buildSshArgs, profileNames, SshProfileSchema, type SshProfile } from "./config.js";

const vps: SshProfile = { name: "vps", host: "1.2.3.4", user: "deploy", port: 2222, identityFile: "~/.ssh/id_ed25519", options: ["StrictHostKeyChecking=accept-new"] };
const bare: SshProfile = { name: "box", host: "box.local" };

describe("resolveSshProfile / profileNames", () => {
  it("finds a profile by name", () => {
    expect(resolveSshProfile("vps", [vps, bare])?.host).toBe("1.2.3.4");
  });
  it("returns null for an unknown name or empty config", () => {
    expect(resolveSshProfile("nope", [vps])).toBeNull();
    expect(resolveSshProfile("vps", undefined)).toBeNull();
  });
  it("lists configured names", () => {
    expect(profileNames([vps, bare])).toEqual(["vps", "box"]);
    expect(profileNames(undefined)).toEqual([]);
  });
});

describe("sshTarget", () => {
  it("uses user@host when a user is set, else host", () => {
    expect(sshTarget(vps)).toBe("deploy@1.2.3.4");
    expect(sshTarget(bare)).toBe("box.local");
  });
});

describe("buildSshArgs", () => {
  it("orders port, identity, options, target, then the remote command", () => {
    expect(buildSshArgs(vps, "uptime")).toEqual([
      "-p", "2222", "-i", "~/.ssh/id_ed25519", "-o", "StrictHostKeyChecking=accept-new", "deploy@1.2.3.4", "uptime",
    ]);
  });
  it("omits the remote command for an interactive shell", () => {
    expect(buildSshArgs(bare)).toEqual(["box.local"]);
  });
});

describe("SshProfileSchema", () => {
  it("rejects an out-of-range port", () => {
    expect(SshProfileSchema.safeParse({ name: "x", host: "h", port: 70000 }).success).toBe(false);
  });
  it("accepts a minimal profile", () => {
    expect(SshProfileSchema.safeParse({ name: "x", host: "h" }).success).toBe(true);
  });
});
