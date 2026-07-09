import { describe, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMarketingCommand } from "./marketing-cmd.js";

describe("runMarketingCommand", () => {
  it("reads an Amplitude fixture", async () => {
    const dir = join(tmpdir(), `vanta-marketing-cli-${Date.now()}`);
    const fixture = join(dir, "amp.json");
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((line = "") => { logs.push(String(line)); });
    await mkdir(dir, { recursive: true });
    await writeFile(fixture, JSON.stringify({ events: [{ event_id: "e1", event_type: "Signup", count: 3 }] }));
    try {
      expect(await runMarketingCommand(["read", "amplitude", "--fixture", fixture])).toBe(0);
      expect(logs.join("\n")).toContain("amplitude event e1 · Signup · 3");
    } finally {
      spy.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
