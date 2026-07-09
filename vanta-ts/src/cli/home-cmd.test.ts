import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHomeCommand } from "./home-cmd.js";

let root: string;
let home: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-home-cmd-root-"));
  home = await mkdtemp(join(tmpdir(), "vanta-home-cmd-home-"));
});

afterEach(async () => {
  await Promise.all([
    rm(root, { recursive: true, force: true }),
    rm(home, { recursive: true, force: true }),
  ]);
});

describe("runHomeCommand", () => {
  it("prints the operator home from an isolated store", async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg = "") => { lines.push(String(msg)); });
    try {
      const code = await runHomeCommand(join(root, ".vanta"), { ...process.env, VANTA_HOME: home });
      const out = lines.join("\n");
      expect(code).toBe(0);
      expect(out).toContain("Operator Home");
      expect(out).toContain("Workflows");
      expect(out).toContain("Channels");
      expect(out).toContain("Agents/Tasks");
      expect(out).toContain("Watchers");
      expect(out).toContain("Setup");
    } finally {
      spy.mockRestore();
    }
  });
});
