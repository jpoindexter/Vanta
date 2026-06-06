import { describe, it, expect } from "vitest";
import { archiveSession, searchArchive } from "./archive.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Message } from "../types.js";

const msg = (role: "user" | "assistant", content: string): Message => ({ role, content });

describe("archiveSession + searchArchive", () => {
  it("archives messages and finds them by keyword", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-test-archive-"));
    try {
      const env = { VANTA_HOME: dir };
      await archiveSession("test-session-1", [msg("user", "hello zork world"), msg("assistant", "sure")], { env });
      const results = await searchArchive("zork", { env });
      expect(results.length).toBe(1);
      expect(results[0]?.excerpt).toContain("zork");
      expect(results[0]?.role).toBe("user");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns empty array when archive dir missing", async () => {
    const results = await searchArchive("anything", { env: { VANTA_HOME: "/tmp/no-such-dir-xyz" } });
    expect(results).toEqual([]);
  });

  it("skips system messages", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-test-archive-"));
    try {
      const env = { VANTA_HOME: dir };
      await archiveSession("s1", [{ role: "system", content: "zork system" }, msg("user", "no match here")], { env });
      const results = await searchArchive("zork", { env });
      expect(results.length).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
