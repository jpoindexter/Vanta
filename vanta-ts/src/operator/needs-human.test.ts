import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listTickets, setStatus } from "../tickets/store.js";
import {
  classifyNeedsHuman,
  recordNeedsHumanOutcome,
  upsertNeedsHumanTicket,
  type NeedsHumanDeps,
} from "./needs-human.js";

function deps(): NeedsHumanDeps {
  let id = 0;
  let tick = 0;
  return {
    now: () => new Date(`2026-07-12T00:00:0${tick++}Z`),
    id: () => `human-${++id}`,
  };
}

describe("needs-human queue", () => {
  it("deduplicates the same blocker and records another occurrence", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-needs-human-"));
    const clock = deps();
    const first = await upsertNeedsHumanTicket(dir, {
      kind: "missing_tool",
      title: "Calendar write tool is unavailable",
      reason: "No configured calendar adapter",
      nextAction: "Configure or build one calendar adapter",
      source: "session:s1",
    }, clock);
    const second = await upsertNeedsHumanTicket(dir, {
      kind: "missing_tool",
      title: "Calendar write tool is unavailable",
      reason: "The same adapter is still absent",
      nextAction: "Configure or build one calendar adapter",
      source: "session:s2",
    }, clock);

    expect(second.created).toBe(false);
    expect(second.ticket.id).toBe(first.ticket.id);
    const tickets = await listTickets(dir);
    expect(tickets).toHaveLength(1);
    expect(tickets[0]?.labels).toContain("needs-human");
    expect(tickets[0]?.comments).toHaveLength(2);
    expect(tickets[0]?.inbox).toBe("unread");
  });

  it("creates a fresh ticket when a resolved blocker recurs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-needs-human-"));
    const clock = deps();
    const first = await upsertNeedsHumanTicket(dir, {
      kind: "decision",
      title: "Choose the production database",
      reason: "Two irreversible options remain",
      nextAction: "Select Postgres or SQLite",
    }, clock);
    await setStatus(dir, first.ticket.id, "done", clock);
    const next = await upsertNeedsHumanTicket(dir, {
      kind: "decision",
      title: "Choose the production database",
      reason: "The decision is needed again",
      nextAction: "Select Postgres or SQLite",
    }, clock);
    expect(next.created).toBe(true);
    expect(next.ticket.id).not.toBe(first.ticket.id);
  });

  it("classifies stopped failures and explicit blockers but not ordinary questions", () => {
    expect(classifyNeedsHuman("Run the migration", {
      finalText: "Stopped: called shell_cmd with identical arguments 3 times without progress.",
      stoppedReason: "repeated_failure",
    })?.kind).toBe("repeated_failure");
    expect(classifyNeedsHuman("Send the brief", {
      finalText: "The Slack adapter is not configured; human setup is required.",
      stoppedReason: "done",
    })?.kind).toBe("missing_tool");
    expect(classifyNeedsHuman("Which color?", {
      finalText: "Do you prefer blue or green?",
      stoppedReason: "done",
    })).toBeNull();
  });

  it("records one actionable ticket from repeated outcomes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-needs-human-"));
    const clock = deps();
    const outcome = {
      finalText: "Reached the 50-iteration limit before completing.",
      stoppedReason: "max_iterations" as const,
    };
    await recordNeedsHumanOutcome(dir, { instruction: "Repair the deployment", outcome, source: "session:abc", deps: clock });
    await recordNeedsHumanOutcome(dir, { instruction: "Repair the deployment", outcome, source: "session:def", deps: clock });
    const tickets = await listTickets(dir);
    expect(tickets).toHaveLength(1);
    expect(tickets[0]?.title).toContain("Repair the deployment");
    expect(tickets[0]?.comments).toHaveLength(2);
  });
});
