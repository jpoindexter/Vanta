import { beforeEach, afterEach, expect, it, vi } from "vitest";

import {
  clearSupportFailures,
  recentSupportFailures,
  recordSupportFailure,
} from "./support-diagnostics";

const KEY = "desktop:support-failures:v1";
beforeEach(() => {
  clearSupportFailures();
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

it("keeps the most recent twenty failures, using only the closed vocabulary", () => {
  for (let i = 0; i < 24; i++) recordSupportFailure("desktop", "timeout");
  recordSupportFailure("chat", "/Users/private/file.pdf token=PRIVATE_CANARY");
  const records = recentSupportFailures();
  expect(records).toHaveLength(20);
  expect(records.at(-1)?.code).toBe("unclassified");
  expect(JSON.stringify(records)).not.toMatch(/PRIVATE_CANARY|file\.pdf|Users/);
  expect(new Set(records.map((record) => record.id)).size).toBe(20);
});

it("rejects an invalid runtime area rather than persisting arbitrary text", () => {
  recordSupportFailure("PRIVATE_CANARY" as "desktop", "timeout");
  expect(recentSupportFailures()).toEqual([]);
});

it("retains new evidence in memory when a write fails while an older stored ring still exists", () => {
  recordSupportFailure("desktop", "timeout");
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  recordSupportFailure("chat", "auth");
  expect(recentSupportFailures().map((record) => record.code)).toEqual([
    "timeout",
    "auth",
  ]);
});

it("excludes old/future events and strips unknown stored fields on read", () => {
  const event = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    area: "desktop",
    code: "timeout",
  };
  localStorage.setItem(
    KEY,
    JSON.stringify([
      { ...event, at: "2000-01-01T00:00:00.000Z" },
      { ...event, at: "2099-01-01T00:00:00.000Z" },
      { ...event, secret: "PRIVATE_CANARY", path: "/private/resume.pdf" },
    ]),
  );
  expect(recentSupportFailures()).toEqual([event]);
});

it("survives a corrupt stored ring and supports explicitly clearing the local codes", () => {
  localStorage.setItem(KEY, "{broken");
  recordSupportFailure("attachment", "attachment_path_unavailable");
  expect(recentSupportFailures()).toHaveLength(1);
  clearSupportFailures();
  expect(recentSupportFailures()).toEqual([]);
  expect(localStorage.getItem(KEY)).toBeNull();
});
