import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildOperatorSpine, formatOperatorSpine } from "./operator-spine.js";

const at = "2026-08-04T10:00:00.000Z";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vanta-op-01-root-"));
  const home = await mkdtemp(join(tmpdir(), "vanta-op-01-home-"));
  const data = join(root, ".vanta");
  const env = { ...process.env, VANTA_HOME: home };
  await mkdir(join(data, "kanban"), { recursive: true });
  await mkdir(join(home, "sessions"), { recursive: true });
  await mkdir(join(home, "runs"), { recursive: true });
  return { root, home, data, env };
}

describe("read-only operator spine", () => {
  it("projects legacy records into the exact lifecycle while preserving source type and id", async () => {
    const { root, home, data, env } = await fixture();
    await writeFile(join(home, "team-tasks.jsonl"), [
      { kind: "task", id: "task-1", workerId: "worker", title: "Prepare proof", status: "running", created: at, updated: at },
      { kind: "task", id: "task-2", workerId: "worker", title: "Claimed done", status: "done", created: at, updated: at },
    ].map((value) => JSON.stringify(value)).join("\n") + "\n");
    await writeFile(join(data, "tickets.json"), JSON.stringify({ version: 1, tickets: [{
      id: "ticket-1", title: "Needs operator", status: "in_progress", inbox: "unread", links: {}, labels: [], comments: [], attachments: [], createdAt: at, updatedAt: at,
    }] }));
    await writeFile(join(data, "scheduled_tasks.json"), JSON.stringify({ tasks: [{ id: 7, cron: "0 9 * * *", instruction: "Daily review", status: "active", durable: true, recurring: true }] }));
    await writeFile(join(data, "kanban", "board-1.json"), JSON.stringify({
      id: "board-1", goal: "Operator proof", created: at, updated: at, swarmRuns: [], lanes: [{
        id: "lane-1", title: "Blocked lane", instruction: "Wait for approval", status: "blocked", blocker: "Approval missing", requiredSkills: [], dependencies: [], evidence: [], wakePolicy: "manual", retries: 0, handoffs: [], updated: at,
      }],
    }));

    const snapshot = await buildOperatorSpine(root, { env, now: new Date(at) });
    const bySource = new Map(snapshot.workItems.map((record) => [`${record.source.kind}:${record.source.id}`, record.item]));

    expect(bySource.get("team_task:task-1")?.state).toBe("running");
    expect(bySource.get("team_task:task-2")?.state).toBe("unverified");
    expect(bySource.get("ticket:ticket-1")?.state).toBe("running");
    expect(bySource.get("schedule:7")?.state).toBe("waiting");
    expect(bySource.get("board_lane:board-1/lane-1")?.state).toBe("needs human");
    expect(snapshot.workItems.every((record) => record.source.id.length > 0 && record.source.path.length > 0)).toBe(true);
    expect(snapshot.views.done).toHaveLength(0);
    expect(snapshot.views.needsYou.map((record) => record.source.id)).toContain("board-1/lane-1");
  });

  it("retains approvals, receipt dispositions, and uncertainty without inventing accomplishment memory", async () => {
    const { root, data, env } = await fixture();
    const workItem = { version: 1, id: "effect-1", outcome: "Send draft", source: "effect:test", state: "unverified", runId: "run-1", updatedAt: at };
    const run = { version: 1, id: "run-1", workItemId: "effect-1", state: "unverified", actor: "test", startedAt: at, settledAt: at };
    const approval = { version: 1, id: "approval-1", workItemId: "effect-1", runId: "run-1", actionSha256: "a".repeat(64), state: "approved", at };
    const receipt = { version: 1, id: "receipt-1", workItemId: "effect-1", runId: "run-1", action: "send", disposition: "unknown", verification: "unverified", at };
    await writeFile(join(data, "work-items.jsonl"), `${JSON.stringify(workItem)}\n`);
    await writeFile(join(data, "runs.jsonl"), `${JSON.stringify(run)}\n`);
    await writeFile(join(data, "approvals.jsonl"), `${JSON.stringify(approval)}\n`);
    await writeFile(join(data, "action-receipts.jsonl"), `${JSON.stringify(receipt)}\n`);

    const snapshot = await buildOperatorSpine(root, { env, now: new Date(at) });
    const record = snapshot.workItems.find((candidate) => candidate.source.id === "effect-1");
    expect(record?.item.state).toBe("unverified");
    expect(record?.item.provenanceMemory).toEqual([{ source: "effect:test", sourceId: "effect-1", capturedAt: at }]);
    expect(record?.related).toEqual({
      runIds: ["run-1"], currentRunId: "run-1", currentAttempt: 1,
      approvalIds: ["approval-1"], receiptIds: ["receipt-1"],
    });
    expect(record?.item).toMatchObject({
      owner: "unassigned", waitCondition: expect.any(String), nextAction: expect.any(String), resumeContext: expect.any(String),
      followUp: { condition: expect.any(String) }, timeCapacityFit: { minutes: 10 }, blocker: expect.any(String), artifacts: [{ kind: "file" }],
    });
    expect(snapshot.runs).toContainEqual(run);
    expect(snapshot.approvals).toContainEqual(approval);
    expect(snapshot.receipts).toContainEqual(receipt);
    expect(snapshot.receipts[0]?.disposition).toBe("unknown");
    expect(snapshot.accomplishments).toEqual([]);
  });

  it("reports corrupt inputs, exact reconciliation, deterministic restart hashes, and performs no writes", async () => {
    const { root, home, data, env } = await fixture();
    await writeFile(join(data, "tickets.json"), JSON.stringify({ version: 1, tickets: [
      { id: "valid", title: "Valid", status: "open", inbox: "unread", links: {}, labels: [], comments: [], attachments: [], createdAt: at, updatedAt: at },
      { id: "broken", title: "Missing fields" },
    ] }));
    await writeFile(join(home, "sessions", "bad.json"), "{not-json");
    const beforeTicket = await readFile(join(data, "tickets.json"), "utf8");
    const beforeSession = await readFile(join(home, "sessions", "bad.json"), "utf8");

    const first = await buildOperatorSpine(root, { env, now: new Date(at) });
    const second = await buildOperatorSpine(root, { env, now: new Date("2026-08-04T11:00:00.000Z") });
    const tickets = first.sources.find((source) => source.kind === "ticket");
    const sessions = first.sources.find((source) => source.kind === "session");

    expect(tickets).toMatchObject({ status: "degraded", sourceCount: 2, projectedCount: 1, sourceIds: ["broken", "valid"] });
    expect(tickets?.issues[0]).toContain("row 2");
    expect(sessions).toMatchObject({ status: "degraded", sourceCount: 1, projectedCount: 0, sourceIds: ["bad"] });
    expect(first.integrity).toBe("degraded");
    expect(first.digest).toBe(second.digest);
    expect(first.sources.map((source) => [source.kind, source.sourceSha256, source.projectionSha256]))
      .toEqual(second.sources.map((source) => [source.kind, source.sourceSha256, source.projectionSha256]));
    expect(await readFile(join(data, "tickets.json"), "utf8")).toBe(beforeTicket);
    expect(await readFile(join(home, "sessions", "bad.json"), "utf8")).toBe(beforeSession);
    expect(formatOperatorSpine(first)).toContain("DEGRADED");
    expect(formatOperatorSpine(first)).toContain("ticket 1/2");
  });
});
