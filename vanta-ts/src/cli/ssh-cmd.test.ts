import { describe, it, expect, vi } from "vitest";
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
