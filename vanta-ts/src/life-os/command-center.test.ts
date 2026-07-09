import { describe, expect, it } from "vitest";
import { buildCommandCenter, COMMAND_CENTER_DASHBOARDS } from "./command-center.js";
import { LifeOsSchema } from "./schema.js";

describe("buildCommandCenter", () => {
  it("renders every promised dashboard lane from the Life OS schema", () => {
    const out = buildCommandCenter(LifeOsSchema.parse({ updatedAt: "2026-07-09T00:00:00.000Z" }));
    for (const dashboard of COMMAND_CENTER_DASHBOARDS) {
      expect(out).toContain(`## ${dashboard}`);
    }
    expect(out).toContain("No active tasks in Life OS.");
    expect(out).toContain("No open opportunities recorded.");
  });

  it("surfaces concrete records across work, money, sales, learning, and reflection", () => {
    const out = buildCommandCenter(LifeOsSchema.parse({
      updatedAt: "2026-07-09T00:00:00.000Z",
      projects: [{ id: "p1", name: "Vanta", status: "active", nextAction: "ship command center" }],
      tasks: [{ id: "t1", title: "Write renderer", status: "active", dueDate: "2026-07-09" }],
      opportunities: [{ id: "o1", title: "Pilot", status: "active", value: 2500, nextAction: "send proposal" }],
      contacts: [{ id: "c1", name: "Jason", company: "Vanta" }],
      revenue: [{ id: "r1", description: "Pilot", amount: 500, date: new Date().toISOString().slice(0, 10) }],
      expenses: [{ id: "e1", description: "Infra", amount: 50, date: new Date().toISOString().slice(0, 10) }],
      decisions: [{ id: "d1", title: "Use Electron first", choice: "fast parity", date: "2026-07-09" }],
      creativeSystems: [{ id: "cs1", name: "Launch writing", status: "active" }],
      learningTracks: [{ id: "l1", topic: "Operators", progress: "daily" }],
      risks: [{ id: "risk1", description: "Scope creep", severity: "high", mitigation: "one slice" }],
      routines: [{ id: "rt1", name: "Daily review", cadence: "daily" }],
    }));

    expect(out).toContain("active: Write renderer due 2026-07-09");
    expect(out).toContain("month: $500 revenue / $50 expenses / $450 net");
    expect(out).toContain("active: Pilot ($2,500) -> send proposal");
    expect(out).toContain("Launch writing [active]");
    expect(out).toContain("Operators - daily");
    expect(out).toContain("2026-07-09: Use Electron first -> fast parity");
  });
});
