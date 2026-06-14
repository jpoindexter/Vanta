import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  dueFollowups, deliverableProgress, latestDeliverables, latestFollowups,
  appendDeliverable, appendFollowup, readDeliverables, readFollowups,
} from "./work.js";
import type { Deliverable, Followup } from "./store.js";

// Fixed epoch: 2024-02-01T12:00:00Z
const NOW = new Date("2024-02-01T12:00:00Z").getTime();
const PAST = "2024-01-28T10:00:00Z"; // 4 days before NOW — past-due
const OLDER_PAST = "2024-01-25T10:00:00Z"; // 7 days before NOW — older past-due
const FUTURE = "2024-02-05T10:00:00Z"; // 4 days after NOW — not due yet

function makeFollowup(id: string, due: string, done?: string): Followup {
  return { kind: "followup", id, prospectId: "acme", note: `note-${id}`, due, done, created: "ts", updated: "ts" };
}

function makeDeliverable(id: string, status: "todo" | "doing" | "done"): Deliverable {
  return { kind: "deliverable", id, title: `Deliverable ${id}`, status, created: "ts", updated: "ts" };
}

describe("dueFollowups", () => {
  it("returns only not-done follow-ups with due ≤ now", () => {
    const followups: Followup[] = [
      makeFollowup("f1", PAST),
      makeFollowup("f2", FUTURE),
    ];
    const result = dueFollowups(followups, NOW);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("f1");
  });

  it("excludes completed follow-ups (done is set)", () => {
    const followups: Followup[] = [
      makeFollowup("f1", PAST, "2024-01-30T00:00:00Z"),
    ];
    expect(dueFollowups(followups, NOW)).toHaveLength(0);
  });

  it("returns soonest first when multiple are due", () => {
    const followups: Followup[] = [
      makeFollowup("later", PAST),
      makeFollowup("sooner", OLDER_PAST),
    ];
    const result = dueFollowups(followups, NOW);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("sooner");
    expect(result[1]!.id).toBe("later");
  });

  it("returns empty when no follow-ups are due", () => {
    expect(dueFollowups([makeFollowup("f1", FUTURE)], NOW)).toHaveLength(0);
  });

  it("returns empty on empty input", () => {
    expect(dueFollowups([], NOW)).toHaveLength(0);
  });

  it("treats exactly-now due date as due (boundary: due === now)", () => {
    const exactly = new Date(NOW).toISOString();
    const followups: Followup[] = [makeFollowup("f1", exactly)];
    expect(dueFollowups(followups, NOW)).toHaveLength(1);
  });
});

describe("deliverableProgress", () => {
  it("counts done vs total", () => {
    const deliverables: Deliverable[] = [
      makeDeliverable("d1", "done"),
      makeDeliverable("d2", "doing"),
      makeDeliverable("d3", "todo"),
    ];
    const result = deliverableProgress(deliverables);
    expect(result.done).toBe(1);
    expect(result.total).toBe(3);
  });

  it("returns 0/0 for empty input", () => {
    const result = deliverableProgress([]);
    expect(result.done).toBe(0);
    expect(result.total).toBe(0);
  });

  it("returns full count when all done", () => {
    const all: Deliverable[] = [makeDeliverable("d1", "done"), makeDeliverable("d2", "done")];
    const result = deliverableProgress(all);
    expect(result.done).toBe(2);
    expect(result.total).toBe(2);
  });

  it("returns 0 done when none are done", () => {
    const none: Deliverable[] = [makeDeliverable("d1", "todo"), makeDeliverable("d2", "doing")];
    const result = deliverableProgress(none);
    expect(result.done).toBe(0);
    expect(result.total).toBe(2);
  });
});

describe("latestDeliverables (latest-write-wins)", () => {
  it("keeps only the last record per id", () => {
    const recs = [
      { kind: "deliverable" as const, id: "d1", title: "First", status: "todo" as const, created: "t1", updated: "t1" },
      { kind: "deliverable" as const, id: "d1", title: "Updated", status: "done" as const, created: "t1", updated: "t2" },
    ];
    const latest = latestDeliverables(recs);
    expect(latest).toHaveLength(1);
    expect(latest[0]!.status).toBe("done");
    expect(latest[0]!.title).toBe("Updated");
  });
});

describe("latestFollowups (latest-write-wins)", () => {
  it("keeps only the last record per id", () => {
    const recs: Followup[] = [
      makeFollowup("f1", FUTURE),
      { ...makeFollowup("f1", PAST), done: "2024-01-30T00:00:00Z" },
    ];
    const latest = latestFollowups(recs);
    expect(latest).toHaveLength(1);
    expect(latest[0]!.done).toBe("2024-01-30T00:00:00Z");
  });
});

describe("appendDeliverable + readDeliverables (I/O)", () => {
  let env: NodeJS.ProcessEnv;
  let home: string;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-work-"));
    env = { VANTA_HOME: home } as NodeJS.ProcessEnv;
  });
  afterEach(async () => { await rm(home, { recursive: true, force: true }); });

  it("persists and reads deliverables (latest-write-wins)", async () => {
    await appendDeliverable(makeDeliverable("d1", "todo"), env);
    await appendDeliverable({ ...makeDeliverable("d1", "done"), updated: "t2" }, env);
    await appendDeliverable(makeDeliverable("d2", "doing"), env);
    const deliverables = await readDeliverables(env);
    expect(deliverables).toHaveLength(2);
    const d1 = deliverables.find((d) => d.id === "d1");
    expect(d1?.status).toBe("done");
  });
});

describe("appendFollowup + readFollowups (I/O)", () => {
  let env: NodeJS.ProcessEnv;
  let home: string;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-work-fu-"));
    env = { VANTA_HOME: home } as NodeJS.ProcessEnv;
  });
  afterEach(async () => { await rm(home, { recursive: true, force: true }); });

  it("persists and reads follow-ups (latest-write-wins)", async () => {
    await appendFollowup(makeFollowup("f1", FUTURE), env);
    await appendFollowup({ ...makeFollowup("f1", PAST), done: "2024-01-30T00:00:00Z" }, env);
    const followups = await readFollowups(env);
    expect(followups).toHaveLength(1);
    expect(followups[0]!.done).toBe("2024-01-30T00:00:00Z");
  });

  it("returns empty on no file", async () => {
    expect(await readFollowups(env)).toHaveLength(0);
  });
});
