import { describe, expect, it } from "vitest";
import { runSetupResumeLoop, selectTuiSurface } from "./launch.js";

describe("selectTuiSurface", () => {
  it("keeps the current TUI as the default", () => {
    expect(selectTuiSurface({})).toBe("v1");
    expect(selectTuiSurface({ VANTA_TUI: "v1" })).toBe("v1");
  });

  it("selects the mission-control surface only when explicitly requested", () => {
    expect(selectTuiSurface({ VANTA_TUI: "v2" })).toBe("v2");
    expect(selectTuiSurface({ VANTA_TUI: " V2 " })).toBe("v2");
  });

  it("falls back to v1 for unknown values", () => {
    expect(selectTuiSurface({ VANTA_TUI: "wide" })).toBe("v1");
  });
});

describe("runSetupResumeLoop", () => {
  it("runs setup outside the surface and prepares a fresh session afterward", async () => {
    const events: string[] = [];
    let surfaces = 0;
    await runSetupResumeLoop({
      prepare: async (firstRun) => {
        events.push(`prepare:${firstRun}`);
        return { generation: events.filter((event) => event.startsWith("prepare")).length };
      },
      runSurface: async (setup, requestSetup) => {
        surfaces += 1;
        events.push(`surface:${setup.generation}`);
        if (surfaces === 1) requestSetup({ section: "messaging", platformId: "telegram" });
      },
      runSetup: async (request) => {
        events.push(`setup:${request.section}:${request.section === "messaging" ? request.platformId : ""}`);
        return true;
      },
    });
    expect(events).toEqual([
      "prepare:true",
      "surface:1",
      "setup:messaging:telegram",
      "prepare:false",
      "surface:2",
    ]);
  });
});
