import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runRuntimeProfileCommand } from "./runtime-profile-cmd.js";

let root: string;
const logs: string[] = [];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-runtime-profile-cli-"));
  logs.length = 0;
});

afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("runtime profile command", () => {
  it("runs create, validate, clone, select, and list through the public command contract", async () => {
    const common = ["--model", "/models/qwen.gguf", "--model-bytes", String(1024 ** 3), "--available-memory", String(8 * 1024 ** 3)];
    expect(await runRuntimeProfileCommand(root, ["create", "--id", "daily", "--name", "Daily", ...common], { log: (line) => logs.push(line) })).toBe(0);
    expect(await runRuntimeProfileCommand(root, ["validate", "daily", "--platform", "darwin", "--arch", "arm64", "--memory", String(8 * 1024 ** 3)], { log: (line) => logs.push(line) })).toBe(0);
    expect(await runRuntimeProfileCommand(root, ["clone", "daily", "daily-safe", "--name", "Daily safe"], { log: (line) => logs.push(line) })).toBe(0);
    expect(await runRuntimeProfileCommand(root, ["select", "daily-safe"], { log: (line) => logs.push(line) })).toBe(0);
    expect(await runRuntimeProfileCommand(root, ["list"], { log: (line) => logs.push(line) })).toBe(0);

    expect(logs.join("\n")).toContain("daily-safe");
    expect(logs.join("\n")).toContain("selected");
    expect(logs.join("\n")).toContain("fits");
  });

  it("discloses advanced controls separately from required create fields", async () => {
    await runRuntimeProfileCommand(root, ["create", "--advanced"], { log: (line) => logs.push(line) });
    expect(logs.join("\n")).toContain("Required:");
    expect(logs.join("\n")).toContain("Advanced:");
    expect(logs.join("\n")).toContain("--extra-arg");
  });

  it("refuses to select a profile that is incompatible with the current host", async () => {
    const common = ["--model", "/models/qwen.gguf", "--model-bytes", String(1024 ** 3), "--available-memory", String(8 * 1024 ** 3), "--platforms", "darwin", "--architectures", "arm64"];
    expect(await runRuntimeProfileCommand(root, ["create", "--id", "mac-only", "--name", "Mac only", ...common], { log: (line) => logs.push(line) })).toBe(0);
    expect(await runRuntimeProfileCommand(root, ["select", "mac-only"], { log: (line) => logs.push(line), host: () => ({ platform: "linux", architecture: "x64", memoryBytes: 8 * 1024 ** 3 }) })).toBe(1);
    expect(logs.join("\n")).toContain("cannot be selected on this host");
    expect(await runRuntimeProfileCommand(root, ["list"], { log: (line) => logs.push(line) })).toBe(0);
    expect(logs.at(-1)).not.toContain("* mac-only");
  });
});
