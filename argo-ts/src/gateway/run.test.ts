import { describe, it, expect } from "vitest";
import { gatewayTick } from "./run.js";
import type { CronEntry } from "../schedule/cron.js";

describe("gatewayTick", () => {
  it("returns 0 and runs nothing when no tasks are due", async () => {
    let calls = 0;
    const n = await gatewayTick({
      dataDir: "/x",
      run: async () => {
        calls++;
        return { finalText: "ran" };
      },
      now: () => new Date("2026-06-02T12:00:00Z"),
      log: () => {},
      load: async () => [],
    });
    expect(n).toBe(0);
    expect(calls).toBe(0);
  });

  it("runs every due active task and logs a line per result", async () => {
    const entries: CronEntry[] = [
      { id: 1, cron: "* * * * *", instruction: "daily brief", status: "active" },
      { id: 2, cron: "* * * * *", instruction: "paused one", status: "paused" },
    ];
    const ran: string[] = [];
    const logs: string[] = [];
    const n = await gatewayTick({
      dataDir: "/x",
      run: async (instruction) => {
        ran.push(instruction);
        return { finalText: `did: ${instruction}` };
      },
      now: () => new Date("2026-06-02T12:00:00Z"),
      log: (m) => logs.push(m),
      load: async () => entries,
    });
    expect(n).toBe(1); // only the active one
    expect(ran).toEqual(["daily brief"]);
    expect(logs.some((l) => l.includes("#1") && l.includes("did: daily brief"))).toBe(true);
  });

  it("a throwing task is captured, not fatal (counts as run)", async () => {
    const entries: CronEntry[] = [
      { id: 7, cron: "* * * * *", instruction: "boom", status: "active" },
    ];
    const logs: string[] = [];
    const n = await gatewayTick({
      dataDir: "/x",
      run: async () => {
        throw new Error("kaboom");
      },
      now: () => new Date("2026-06-02T12:00:00Z"),
      log: (m) => logs.push(m),
      load: async () => entries,
    });
    expect(n).toBe(1);
    expect(logs.some((l) => l.includes("error: kaboom"))).toBe(true);
  });
});
