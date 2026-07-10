import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runKeybindingsCommand } from "./keybindings-cmd.js";

describe("runKeybindingsCommand", () => {
  async function envAndLogs(): Promise<{ env: NodeJS.ProcessEnv; logs: string[] }> {
    return { env: { VANTA_HOME: await mkdtemp(join(tmpdir(), "vanta-kb-cmd-")) }, logs: [] };
  }

  it("writes a template and reports the path", async () => {
    const { env, logs } = await envAndLogs();
    await expect(runKeybindingsCommand(["template"], env, (line) => logs.push(line))).resolves.toBe(0);
    expect(logs.join("\n")).toContain("keybindings template written:");
    await expect(runKeybindingsCommand(["template"], env, (line) => logs.push(line))).resolves.toBe(1);
    expect(logs.join("\n")).toContain("already exists");
  });

  it("doctor reports missing, ok, and invalid configs", async () => {
    const { env, logs } = await envAndLogs();
    await expect(runKeybindingsCommand(["doctor"], env, (line) => logs.push(line))).resolves.toBe(0);
    expect(logs.join("\n")).toContain("no config yet");

    logs.length = 0;
    await runKeybindingsCommand(["template"], env, () => {});
    await expect(runKeybindingsCommand(["doctor"], env, (line) => logs.push(line))).resolves.toBe(0);
    expect(logs.join("\n")).toContain("keybindings: ok");

    logs.length = 0;
    await writeFile(join(String(env.VANTA_HOME), "keybindings.json"), "{broken", "utf8");
    await expect(runKeybindingsCommand(["doctor"], env, (line) => logs.push(line))).resolves.toBe(1);
    expect(logs.join("\n")).toContain("keybindings error: invalid JSON");
  });

  it("prints the config path", async () => {
    const { env, logs } = await envAndLogs();
    await expect(runKeybindingsCommand(["path"], env, (line) => logs.push(line))).resolves.toBe(0);
    expect(logs[0]).toContain("keybindings.json");
  });
});
