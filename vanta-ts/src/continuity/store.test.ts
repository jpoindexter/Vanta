import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyContinuityAction,
  captureContinuityItem,
  continuityStorePath,
  loadContinuitySnapshot,
} from "./store.js";
import { defaultNdSupport } from "../nd/engine.js";
import { saveNdSupport } from "../nd/profile.js";

const roots: string[] = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vanta-continuity-"));
  roots.push(root);
  await writeFile(join(root, "brief.md"), "# Messy brief\n\n- [ ] Email Sam the revised outline\n- [ ] Archive old notes\n", "utf8");
  const env = { VANTA_HOME: join(root, ".home") } as NodeJS.ProcessEnv;
  return { root, env };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("continuity operator store", () => {
  it("captures without taxonomy and prepares one bounded Today recommendation", async () => {
    const { root, env } = await fixture();
    const result = await captureContinuityItem(root, {
      text: "I need to get the revised outline back to Sam but I lost the thread",
      sourcePath: "brief.md",
      capacity: { attentional: "low", time: "steady" },
    }, { env, now: () => new Date("2026-08-02T12:00:00.000Z"), id: () => "continuity-1" });

    expect(result.item.outcome).toContain("revised outline");
    expect(result.item.source).toBe("local-file:brief.md");
    expect(result.item.recommendation).toContain("brief.md");
    expect(result.item.choices).toEqual(["do it", "show me", "snooze"]);
    expect(result.item.choices).toHaveLength(3);
    expect(result.item.preparedAction).toMatchObject({ kind: "read_local_file", target: "brief.md", minutes: 10, reversible: true });
    expect(result.item.timeCapacityFit.capacity).toMatchObject({ attentional: "low", time: "steady", sensory: "unknown" });
    expect(result.snapshot.today.map((item) => item.id)).toEqual(["continuity-1"]);
    expect(result.snapshot.projections.now.map((item) => item.id)).toEqual(["continuity-1"]);
    expect(result.snapshot.projections).toMatchObject({
      captured: [], waiting: [], needsYou: [], done: [],
    });
  });

  it("binds an at-mentioned project file from the same messy capture", async () => {
    const { root, env } = await fixture();
    const result = await captureContinuityItem(root, {
      text: "I lost the thread in @brief.md and need one next step",
    }, { env, id: () => "continuity-1" });

    expect(result.item.source).toBe("local-file:brief.md");
    expect(result.item.preparedAction.target).toBe("brief.md");
  });

  it("inherits effective capacity from the shared support profile", async () => {
    const { root, env } = await fixture();
    const support = defaultNdSupport();
    await saveNdSupport({
      ...support,
      capacity: { ...support.capacity, attentional: "low", time: "steady" },
      transient: { expiresAt: "2099-08-03T12:00:00.000Z" },
    }, env);

    const result = await captureContinuityItem(root, { text: "Review @brief.md" }, {
      env,
      now: () => new Date("2026-08-02T12:00:00.000Z"),
      id: () => "continuity-1",
    });
    expect(result.item.timeCapacityFit.capacity).toMatchObject({ attentional: "low", time: "steady" });
  });

  it("settles a local read exactly once and resumes after a store reload", async () => {
    const { root, env } = await fixture();
    await captureContinuityItem(root, { text: "Find the first unfinished step", sourcePath: "brief.md" }, {
      env, now: () => new Date("2026-08-02T12:00:00.000Z"), id: () => "continuity-1",
    });
    const shown = await applyContinuityAction(root, "continuity-1", { action: "show_me" }, { env, now: () => new Date("2026-08-02T12:00:30.000Z") });
    expect(shown.preview).toContain("No project files will change");

    const first = await applyContinuityAction(root, "continuity-1", { action: "do_it" }, { env, now: () => new Date("2026-08-02T12:01:00.000Z") });
    const replay = await applyContinuityAction(root, "continuity-1", { action: "do_it" }, { env, now: () => new Date("2026-08-02T12:02:00.000Z") });
    const restarted = await loadContinuitySnapshot(root, { env, now: () => new Date("2026-08-02T12:03:00.000Z") });

    expect(first.item).toMatchObject({
      state: "waiting",
      owner: "operator",
      waitCondition: "Continue when you are ready",
      nextAction: "Email Sam the revised outline",
    });
    expect(first.item.lastVerified?.evidence).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.item.resumeContext).toContain("Email Sam the revised outline");
    expect(replay.replayed).toBe(true);
    expect(restarted.receipts).toHaveLength(1);
    expect(restarted.runs).toHaveLength(1);
    expect(restarted.today[0]?.nextAction).toBe("Email Sam the revised outline");
    expect(restarted.reentry).toEqual({ itemId: "continuity-1", action: "Email Sam the revised outline" });
  });

  it("supports snooze and skip without treating dispositions as WorkItem states", async () => {
    const { root, env } = await fixture();
    await captureContinuityItem(root, { text: "Review the outline", sourcePath: "brief.md" }, { env, id: () => "continuity-1" });
    const snoozed = await applyContinuityAction(root, "continuity-1", { action: "snooze", until: "2026-08-03T09:00:00.000Z" }, { env });
    expect(snoozed.item.state).toBe("waiting");
    expect(snoozed.item.followUp?.at).toBe("2026-08-03T09:00:00.000Z");
    const skipped = await applyContinuityAction(root, "continuity-1", { action: "skip" }, { env });
    expect(skipped.item.state).toBe("stopped");
    expect(skipped.receipt?.disposition).toBe("denied");
  });

  it("serializes concurrent capture and reports read-only legacy reconciliation", async () => {
    const { root, env } = await fixture();
    await mkdir(join(root, ".vanta"), { recursive: true });
    await writeFile(join(root, ".vanta", "tickets.json"), JSON.stringify({ version: 1, tickets: [{ id: "t-1" }] }), "utf8");
    await Promise.all([
      captureContinuityItem(root, { text: "One", sourcePath: "brief.md" }, { env, id: () => "continuity-1" }),
      captureContinuityItem(root, { text: "Two", sourcePath: "brief.md" }, { env, id: () => "continuity-2" }),
    ]);
    const snapshot = await loadContinuitySnapshot(root, { env });
    expect(snapshot.inbox).toHaveLength(2);
    expect(snapshot.legacy.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "tickets", readOnly: true, count: 1, ids: ["t-1"], sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    ]));
    expect(snapshot.legacy.reconciledAt).toBeTruthy();
  });

  it("keeps corrupt legacy bytes visible and read only", async () => {
    const { root, env } = await fixture();
    await mkdir(join(root, ".vanta"), { recursive: true });
    await writeFile(join(root, ".vanta", "tickets.json"), "{not-json", "utf8");

    const snapshot = await loadContinuitySnapshot(root, { env });
    expect(snapshot.legacy.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "tickets",
        readOnly: true,
        count: 0,
        ids: [],
        error: "invalid JSON: unreadable",
        sha256: expect.not.stringMatching(/^e3b0c442/),
      }),
    ]));
    await expect(readFile(join(root, ".vanta", "tickets.json"), "utf8")).resolves.toBe("{not-json");
  });

  it("keeps a corrupt canonical store visible instead of returning a false empty state", async () => {
    const { root, env } = await fixture();
    await mkdir(join(root, ".vanta"), { recursive: true });
    await writeFile(continuityStorePath(root), "{not-json", "utf8");
    const snapshot = await loadContinuitySnapshot(root, { env });
    expect(snapshot.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "continuity_store_unreadable" }),
      expect.objectContaining({ code: "operator_source_unreadable" }),
    ]));
    expect(snapshot.integrity).toBe("degraded");
    await expect(readFile(continuityStorePath(root), "utf8")).resolves.toBe("{not-json");
  });
});
