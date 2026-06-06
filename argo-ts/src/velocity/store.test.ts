import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendVelocityEvent,
  readVelocityEvents,
  velocityStats,
  type VelocityEvent,
} from "./store.js";

describe("velocityStats", () => {
  const now = new Date("2026-06-04T12:00:00Z");
  const DAY_MS = 24 * 60 * 60 * 1000;
  const WINDOW = 7 * DAY_MS;

  const event = (type: VelocityEvent["type"], daysAgo: number): VelocityEvent => ({
    type,
    itemId: `item-${Math.random()}`,
    at: new Date(now.getTime() - daysAgo * DAY_MS).toISOString(),
  });

  it("counts captures and ships within the window", () => {
    const events: VelocityEvent[] = [
      event("capture", 1),
      event("capture", 3),
      event("ship", 2),
    ];
    const stats = velocityStats(events, WINDOW, now);
    expect(stats.captures).toBe(2);
    expect(stats.ships).toBe(1);
    expect(stats.ratio).toBe(2);
    expect(stats.warn).toBe(false);
  });

  it("excludes events outside the window", () => {
    const events: VelocityEvent[] = [
      event("capture", 8),
      event("ship", 10),
    ];
    const stats = velocityStats(events, WINDOW, now);
    expect(stats.captures).toBe(0);
    expect(stats.ships).toBe(0);
  });

  it("returns null ratio and warn=false when no events", () => {
    const stats = velocityStats([], WINDOW, now);
    expect(stats.ratio).toBeNull();
    expect(stats.warn).toBe(false);
  });

  it("warns when captures exist but ships is zero (infinite ratio)", () => {
    const stats = velocityStats([event("capture", 1)], WINDOW, now);
    expect(stats.ratio).toBeNull();
    expect(stats.warn).toBe(true);
  });

  it("warns when ratio exceeds 5:1", () => {
    const events = [
      ...Array.from({ length: 12 }, () => event("capture", 1)),
      event("ship", 1),
      event("ship", 2),
    ];
    const stats = velocityStats(events, WINDOW, now);
    expect(stats.ratio).toBe(6);
    expect(stats.warn).toBe(true);
  });

  it("does not warn when ratio is exactly 5:1", () => {
    const events = [
      ...Array.from({ length: 5 }, () => event("capture", 1)),
      event("ship", 1),
    ];
    const stats = velocityStats(events, WINDOW, now);
    expect(stats.ratio).toBe(5);
    expect(stats.warn).toBe(false);
  });
});

describe("appendVelocityEvent / readVelocityEvents", () => {
  let tmpDir: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "argo-velocity-test-"));
    env = { VANTA_HOME: tmpDir };
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("creates the file and appends events", async () => {
    await appendVelocityEvent(env, { type: "capture", itemId: "X1", at: "2026-01-01T00:00:00Z" });
    await appendVelocityEvent(env, { type: "ship", itemId: "X2", at: "2026-01-02T00:00:00Z" });
    const events = await readVelocityEvents(env);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: "capture", itemId: "X1" });
    expect(events[1]).toMatchObject({ type: "ship", itemId: "X2" });
  });

  it("returns empty array when file does not exist", async () => {
    const events = await readVelocityEvents(env);
    expect(events).toEqual([]);
  });
});
