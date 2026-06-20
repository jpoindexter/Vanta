import { describe, it, expect, vi, afterEach } from "vitest";
import { runSshCommand, type LoadSettings } from "./ssh-cmd.js";
import type { SshProfile } from "../ssh/config.js";

const profiles: SshProfile[] = [{ name: "vps", host: "1.2.3.4", user: "deploy", port: 2222 }];
const load = (configs?: SshProfile[]): LoadSettings => async () => ({ sshConfigs: configs });

describe("runSshCommand", () => {
  it("spawns ssh with the resolved profile's args", async () => {
    const spawn = vi.fn(async () => 0);
    const code = await runSshCommand("/repo", ["vps"], { spawn, loadSettings: load(profiles) });
    expect(code).toBe(0);
    // `--` terminates ssh option parsing so a hostile host/user can't be read as a flag (injection fix).
    expect(spawn).toHaveBeenCalledWith("ssh", ["-p", "2222", "--", "deploy@1.2.3.4"]);
  });

  it("returns 1 and does not spawn for an unknown profile", async () => {
    const spawn = vi.fn(async () => 0);
    const code = await runSshCommand("/repo", ["ghost"], { spawn, loadSettings: load(profiles) });
    expect(code).toBe(1);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("returns 1 with usage when no name is given", async () => {
    const spawn = vi.fn(async () => 0);
    const code = await runSshCommand("/repo", [], { spawn, loadSettings: load(profiles) });
    expect(code).toBe(1);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("propagates the ssh exit code", async () => {
    const spawn = vi.fn(async () => 255);
    expect(await runSshCommand("/repo", ["vps"], { spawn, loadSettings: load(profiles) })).toBe(255);
  });
});

describe("runSshCommand — agent session mode", () => {
  afterEach(() => { delete process.env.VANTA_SSH_SESSION; });

  it("opens the interactive agent session for an explicit user@host (sets VANTA_SSH_SESSION, no ssh spawn)", async () => {
    const spawn = vi.fn(async () => 0);
    const start = vi.fn(async () => {});
    const code = await runSshCommand("/repo", ["root@example.com"], { spawn, start, loadSettings: load(profiles) });
    expect(code).toBe(0);
    expect(start).toHaveBeenCalledWith("/repo");
    expect(spawn).not.toHaveBeenCalled();
    expect(process.env.VANTA_SSH_SESSION).toBe("root@example.com");
  });

  it("--agent forces the agent session even for a configured profile name", async () => {
    const spawn = vi.fn(async () => 0);
    const start = vi.fn(async () => {});
    const code = await runSshCommand("/repo", ["--agent", "vps"], { spawn, start, loadSettings: load(profiles) });
    expect(code).toBe(0);
    expect(start).toHaveBeenCalledOnce();
    expect(spawn).not.toHaveBeenCalled();
    expect(process.env.VANTA_SSH_SESSION).toBe("vps");
  });

  it("--shell forces a plain shell to an explicit user@host (spawns ssh, no agent session)", async () => {
    const spawn = vi.fn(async () => 0);
    const start = vi.fn(async () => {});
    const code = await runSshCommand("/repo", ["--shell", "root@example.com"], { spawn, start, loadSettings: load(profiles) });
    expect(code).toBe(0);
    expect(spawn).toHaveBeenCalledWith("ssh", ["--", "root@example.com"]);
    expect(start).not.toHaveBeenCalled();
    expect(process.env.VANTA_SSH_SESSION).toBeUndefined();
  });
});
