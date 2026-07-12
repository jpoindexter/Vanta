import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appendDocRouterEvent } from "../context/router-health.js";
import { recordWorkOutcome } from "../maintenance/budget.js";
import { upsertNeedsHumanTicket } from "../operator/needs-human.js";
import { listTickets } from "../tickets/store.js";
import { runMaintenanceCommand } from "./maintenance-cmd.js";

afterEach(() => vi.restoreAllMocks());

describe("vanta maintenance", () => {
  it("renders queue, documentation health, and budget in one status", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-maint-cli-"));
    await writeFile(join(root, "AGENTS.md"), "Always verify the real path.\n", "utf8");
    const dataDir = join(root, ".vanta");
    await appendDocRouterEvent(dataDir, { kind: "loaded", path: "AGENTS.md", source: "prompt" });
    await upsertNeedsHumanTicket(dataDir, { kind: "decision", title: "Choose a provider", reason: "Two remain", nextAction: "Pick one" });
    await recordWorkOutcome(dataDir, { instruction: "Build onboarding", sessionId: "s1", elapsedMs: 10, toolIterations: 0, stoppedReason: "done" });
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line) => lines.push(String(line)));
    expect(await runMaintenanceCommand(root, [])).toBe(0);
    const output = lines.join("\n");
    expect(output).toContain("Needs-human queue");
    expect(output).toContain("Documentation router health");
    expect(output).toContain("Maintenance budget");
  });

  it("lists and resolves needs-human tickets", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-maint-cli-"));
    const dataDir = join(root, ".vanta");
    const created = await upsertNeedsHumanTicket(dataDir, { kind: "decision", title: "Choose a provider", reason: "Two remain", nextAction: "Pick one" });
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line) => lines.push(String(line)));
    expect(await runMaintenanceCommand(root, ["queue"])).toBe(0);
    expect(lines.join("\n")).toContain(created.ticket.id);
    expect(await runMaintenanceCommand(root, ["resolve", created.ticket.id])).toBe(0);
    const ticket = (await listTickets(dataDir))[0];
    expect(ticket?.status).toBe("done");
    expect(ticket?.inbox).toBe("archived");
  });

  it("emits machine-readable docs and budget reports", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-maint-cli-"));
    await writeFile(join(root, "AGENTS.md"), "Rules\n", "utf8");
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line) => lines.push(String(line)));
    await runMaintenanceCommand(root, ["docs", "--json"]);
    expect(JSON.parse(lines.pop() ?? "{}")).toHaveProperty("neverConsulted");
    await runMaintenanceCommand(root, ["budget", "--json"]);
    expect(JSON.parse(lines.pop() ?? "{}")).toHaveProperty("maintenanceTimeRatio");
  });
});
