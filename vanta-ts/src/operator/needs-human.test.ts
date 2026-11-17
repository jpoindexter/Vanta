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
  it.each([
    ["What does blocked mean?", "Blocked means an action needs permission or a missing capability."],
    ["What permissions are needed?", "Approval is required for consequential changes."],
    ["Hi", "No tools are unavailable today."],
    ["How do I set up Slack?", "The Slack adapter is not configured; human setup is required."],
  ])("does not turn a completed conversation into attention work: %s", (instruction, finalText) => {
    expect(classifyNeedsHuman(instruction, { finalText, stoppedReason: "done" })).toBeNull();
  });

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

});

describe("needs-human queue", () => {
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

  it("classifies stopped failures and typed blocked outcomes but not ordinary questions", () => {
    expect(classifyNeedsHuman("Run the migration", {
      finalText: "Stopped: called shell_cmd with identical arguments 3 times without progress.",
      stoppedReason: "repeated_failure",
    })?.kind).toBe("repeated_failure");
    expect(classifyNeedsHuman("Send the brief", {
      finalText: "The Slack adapter is not configured; human setup is required.",
      stoppedReason: "blocked",
    })?.kind).toBe("missing_tool");
    expect(classifyNeedsHuman("Which color?", {
      finalText: "Do you prefer blue or green?",
      stoppedReason: "done",
    })).toBeNull();
  });

});

describe("needs-human queue", () => {
  it("records one actionable ticket from repeated outcomes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-needs-human-"));
    const clock = deps();
    const outcome = {
      finalText: "Reached the 50-iteration limit before completing.",
      stoppedReason: "max_iterations" as const,
    };
    await recordNeedsHumanOutcome(dir, { instruction: "Repair the deployment", outcome, source: "session:abc", deps: clock });
    await recordNeedsHumanOutcome(dir, { instruction: "Repair the deployment", outcome, source: "session:abc", deps: clock });
    const tickets = await listTickets(dir);
    expect(tickets).toHaveLength(1);
    expect(tickets[0]?.title).toContain("Repair the deployment");
    expect(tickets[0]?.comments).toHaveLength(2);
  });
});

describe("automatic blocker ownership", () => {
  it.each([undefined, "", " "])("does not merge automatic blockers without a source binding: %j", async source => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-needs-human-")), clock = deps();
    const input = { source, instruction: "Continue research", outcome: { finalText: "Iteration limit", stoppedReason: "max_iterations" }, deps: clock };
    await recordNeedsHumanOutcome(dir, input);
    await recordNeedsHumanOutcome(dir, input);
    expect((await listTickets(dir))).toHaveLength(2);
  });

  it("resolving one chat's repeated blocker leaves the other chat unchanged", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-needs-human-")), clock = deps();
    const input = { instruction: "Continue research", outcome: { finalText: "Iteration limit", stoppedReason: "max_iterations" } };
    const a = await recordNeedsHumanOutcome(dir, { ...input, source: "session:a", deps: clock });
    const again = await recordNeedsHumanOutcome(dir, { ...input, source: "session:a", deps: clock });
    const b = await recordNeedsHumanOutcome(dir, { ...input, source: "session:b", deps: clock });
    expect(again?.ticket.id).toBe(a?.ticket.id);
    expect(again?.ticket.comments).toHaveLength(2);
    expect(b?.ticket.id).not.toBe(a?.ticket.id);
    await setStatus(dir, a!.ticket.id, "done", clock);
    expect((await listTickets(dir)).find(row => row.id === b?.ticket.id)).toEqual(b?.ticket);
  });

  it("does not collapse distinct requests hidden by the shortened display title", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-needs-human-")), clock = deps();
    const common = "Use the same detailed research brief. ".repeat(5);
    const input = { source: "session:a", outcome: { finalText: "Iteration limit", stoppedReason: "max_iterations" }, deps: clock };
    const first = await recordNeedsHumanOutcome(dir, { ...input, instruction: common + "Account A" });
    const second = await recordNeedsHumanOutcome(dir, { ...input, instruction: common + "Account B" });
    expect(second?.ticket.title).toBe(first?.ticket.title);
    expect(second?.ticket.id).not.toBe(first?.ticket.id);
    expect((await listTickets(dir))).toHaveLength(2);
  });
});
