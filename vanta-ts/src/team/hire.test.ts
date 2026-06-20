import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hireAgent, deriveAgentId, slugifyRole, type HireSpec } from "./hire.js";
import { appendTeam, readTeam, latestWorkers, type Worker } from "./store.js";
import { assignTask } from "./tasks.js";
import { parseHireArgs } from "../cli/hire-cmd.js";

function worker(id: string, role = id): Worker {
  return { kind: "worker", id, role, status: "idle", ts: "t0" };
}

describe("slugifyRole", () => {
  it("kebab-cases and strips non-alphanumerics", () => {
    expect(slugifyRole("Web Scraper")).toBe("web-scraper");
    expect(slugifyRole("  Data/Analyst!! ")).toBe("data-analyst");
    expect(slugifyRole("QA")).toBe("qa");
  });
});

describe("deriveAgentId", () => {
  it("uses the bare slug when free", () => {
    expect(deriveAgentId([], "Researcher")).toBe("researcher");
  });
  it("appends a counter when the slug is taken", () => {
    expect(deriveAgentId([worker("researcher")], "Researcher")).toBe("researcher-2");
    expect(deriveAgentId([worker("researcher"), worker("researcher-2")], "Researcher")).toBe("researcher-3");
  });
  it("falls back to agent for an empty slug", () => {
    expect(deriveAgentId([], "!!!")).toBe("agent");
  });
});

describe("hireAgent", () => {
  it("adds a role-tagged, budgeted agent for a known adapter", () => {
    const r = hireAgent([], { role: "Researcher", adapter: "openai", budgetUsd: 25 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.agent.id).toBe("researcher");
    expect(r.agent.role).toBe("Researcher");
    expect(r.agent.adapter).toBe("openai");
    expect(r.agent.budgetUsd).toBe(25);
    expect(r.agent.title).toBe("Researcher");
    expect(r.agent.status).toBe("idle");
    // model is resolved from the adapter's catalog default so the agent is runnable.
    expect(r.agent.model).toBe("gpt-4o-mini");
    expect(r.roster).toHaveLength(1);
  });

  it("uses a supplied title as the tag", () => {
    const r = hireAgent([], { role: "Researcher", adapter: "anthropic", title: "Lead Researcher" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.agent.title).toBe("Lead Researcher");
    expect(r.agent.budgetUsd).toBeUndefined();
  });

  it("rejects an unknown adapter", () => {
    const r = hireAgent([], { role: "Researcher", adapter: "not-a-provider" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/unknown adapter/);
  });

  it("rejects a non-positive budget", () => {
    const zero = hireAgent([], { role: "x", adapter: "openai", budgetUsd: 0 });
    expect(zero.ok).toBe(false);
    const neg = hireAgent([], { role: "x", adapter: "openai", budgetUsd: -5 });
    expect(neg.ok).toBe(false);
    const nan = hireAgent([], { role: "x", adapter: "openai", budgetUsd: Number.NaN });
    expect(nan.ok).toBe(false);
  });

  it("rejects an empty role", () => {
    const r = hireAgent([], { role: "   ", adapter: "openai" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/role is required/);
  });

  it("derives a fresh id rather than colliding with an existing worker", () => {
    const r = hireAgent([worker("researcher")], { role: "Researcher", adapter: "openai" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.agent.id).toBe("researcher-2");
    expect(r.roster).toHaveLength(2);
  });
});

describe("hired agent is dispatch-eligible", () => {
  let env: NodeJS.ProcessEnv;
  let home: string;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-hire-"));
    env = { VANTA_HOME: home } as NodeJS.ProcessEnv;
  });
  afterEach(async () => { await rm(home, { recursive: true, force: true }); });

  it("persists to the roster and can be assigned a task via the dispatch path", async () => {
    const spec: HireSpec = { role: "Researcher", adapter: "openai", budgetUsd: 10 };
    const r = hireAgent([], spec);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await appendTeam(r.agent, env);

    // The hired agent appears in the roster.
    const roster = latestWorkers(await readTeam(env));
    expect(roster.map((w) => w.id)).toContain("researcher");
    const hired = roster.find((w) => w.id === "researcher")!;
    expect(hired.adapter).toBe("openai");
    expect(hired.budgetUsd).toBe(10);

    // The existing dispatch path accepts the hired worker id.
    const task = assignTask([], "t1", hired.id, "summarize the report");
    expect(task.ok).toBe(true);
    if (!task.ok) return;
    expect(task.value.workerId).toBe("researcher");
    expect(task.value.status).toBe("assigned");
  });

  it("tolerates a pre-hire roster row without the new fields", async () => {
    // Older rows predate adapter/budgetUsd/title — they must still load.
    await appendTeam({ kind: "worker", id: "legacy", role: "old worker", status: "idle", ts: "t0" }, env);
    const roster = latestWorkers(await readTeam(env));
    const legacy = roster.find((w) => w.id === "legacy")!;
    expect(legacy.role).toBe("old worker");
    expect(legacy.adapter).toBeUndefined();
    expect(legacy.budgetUsd).toBeUndefined();
  });
});

describe("parseHireArgs", () => {
  it("parses role + adapter + budget + title", () => {
    const r = parseHireArgs(["Researcher", "--adapter", "openai", "--budget", "25", "--title", "Lead"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.spec.role).toBe("Researcher");
    expect(r.spec.adapter).toBe("openai");
    expect(r.spec.budgetUsd).toBe(25);
    expect(r.spec.title).toBe("Lead");
  });

  it("treats the first non-flag token as the role", () => {
    const r = parseHireArgs(["--adapter", "openai", "data-analyst"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.spec.role).toBe("data-analyst");
  });

  it("requires a role", () => {
    const r = parseHireArgs(["--adapter", "openai"]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/role is required/);
  });

  it("requires --adapter", () => {
    const r = parseHireArgs(["Researcher"]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/--adapter/);
  });

  it("rejects a non-numeric budget", () => {
    const r = parseHireArgs(["Researcher", "--adapter", "openai", "--budget", "lots"]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/--budget must be a positive number/);
  });

  it("omits budgetUsd when no --budget flag is given", () => {
    const r = parseHireArgs(["Researcher", "--adapter", "openai"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.spec.budgetUsd).toBeUndefined();
  });
});
