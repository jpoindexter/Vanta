import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createServiceManager } from "./manager.js";

describe("cross-platform service manager", () => {
  it("installs, starts, restarts, stops, and removes a systemd user service", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-service-"));
    const exec = vi.fn(async () => ({ stdout: "inactive\n", stderr: "" }));
    const manager = createServiceManager({ platform: "linux", home, vantaHome: join(home, ".vanta"), exec });
    const artifact = await manager.install("/repo");
    expect(await readFile(artifact, "utf8")).toContain("VANTA-MANAGED");
    await manager.restart();
    await manager.stop();
    expect(exec.mock.calls.map((call) => call.slice(0, 2))).toContainEqual(["systemctl", ["--user", "restart", "vanta-gateway.service"]]);
    const status = await manager.status();
    expect(status).toMatchObject({ platform: "linux", installed: true, running: false, stale: true });
    await manager.uninstall();
    expect(exec).toHaveBeenCalledWith("systemctl", ["--user", "disable", "--now", "vanta-gateway.service"]);
  });

  it("refuses to remove an artifact it does not own", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-service-"));
    const unitDir = join(home, ".config", "systemd", "user");
    await mkdir(unitDir, { recursive: true });
    await writeFile(join(unitDir, "vanta-gateway.service"), "[Service]\nExecStart=/someone/else\n");
    const manager = createServiceManager({ platform: "linux", home, vantaHome: join(home, ".vanta"), exec: async () => ({ stdout: "", stderr: "" }) });
    await expect(manager.uninstall()).rejects.toThrow("not Vanta-owned");
  });

  it("uses Task Scheduler without admin elevation on Windows", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-service-"));
    const exec = vi.fn(async (_file: string, args: string[]) => ({ stdout: args.includes("/Query") ? "Status: Running" : "", stderr: "" }));
    const manager = createServiceManager({ platform: "win32", home, vantaHome: join(home, ".vanta"), exec });
    await manager.install("C:\\Vanta");
    expect(exec.mock.calls.some((call) => call[0] === "schtasks" && call[1].includes("/Create"))).toBe(true);
    expect((await manager.status()).running).toBe(true);
  });
});
