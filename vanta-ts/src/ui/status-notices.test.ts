import { describe, it, expect } from "vitest";
import {
  addNotice,
  pruneExpired,
  visibleNotices,
  noticeGlyph,
  formatNotice,
  DEFAULT_NOTICE_TTL_MS,
  MAX_NOTICES,
  type Notice,
} from "./status-notices.js";
import { GLYPHS } from "../term/figures.js";

const NOW = 1_000;

/** First notice of a non-empty list — narrows away `| undefined` from
 *  noUncheckedIndexedAccess so the assertions type-check. */
function first(list: Notice[]): Notice {
  const n = list[0];
  if (!n) throw new Error("expected a notice");
  return n;
}

describe("addNotice", () => {
  it("assigns an id, level, and expiry = now + ttl", () => {
    const n = first(addNotice([], "kernel reconnecting", "warn", { nowMs: NOW, ttlMs: 5_000 }));
    expect(n.id).toBeTruthy();
    expect(n.level).toBe("warn");
    expect(n.text).toBe("kernel reconnecting");
    expect(n.expiresAtMs).toBe(NOW + 5_000);
  });

  it("defaults the ttl when none is given", () => {
    const n = first(addNotice([], "MCP mounted", "success", { nowMs: NOW }));
    expect(n.expiresAtMs).toBe(NOW + DEFAULT_NOTICE_TTL_MS);
  });

  it("does not mutate the input array", () => {
    const before: Notice[] = [];
    const after = addNotice(before, "x", "info", { nowMs: NOW });
    expect(before).toHaveLength(0);
    expect(after).toHaveLength(1);
    expect(after).not.toBe(before);
  });

  it("assigns a unique id even within the same millisecond", () => {
    const list = addNotice(addNotice([], "a", "info", { nowMs: NOW }), "b", "info", { nowMs: NOW });
    const ids = new Set(list.map((n) => n.id));
    expect(ids.size).toBe(2);
  });

  it("caps to MAX_NOTICES keeping the newest", () => {
    let list: Notice[] = [];
    for (const t of ["a", "b", "c", "d", "e"]) {
      list = addNotice(list, t, "info", { nowMs: NOW });
    }
    expect(list).toHaveLength(MAX_NOTICES);
    expect(list.map((n) => n.text)).toEqual(["c", "d", "e"]);
  });
});

describe("pruneExpired", () => {
  it("drops notices whose ttl has elapsed", () => {
    const list = addNotice([], "old", "info", { nowMs: NOW, ttlMs: 100 });
    expect(pruneExpired(list, NOW + 101)).toHaveLength(0);
  });

  it("keeps a notice exactly at expiry is gone (expiresAtMs <= now)", () => {
    const list = addNotice([], "edge", "info", { nowMs: NOW, ttlMs: 100 });
    // expiresAtMs === NOW + 100; at that exact ms it is no longer live.
    expect(pruneExpired(list, NOW + 100)).toHaveLength(0);
    expect(pruneExpired(list, NOW + 99)).toHaveLength(1);
  });

  it("retains live notices and does not mutate the input", () => {
    const list = addNotice([], "fresh", "info", { nowMs: NOW, ttlMs: 5_000 });
    const pruned = pruneExpired(list, NOW + 1_000);
    expect(pruned).toHaveLength(1);
    expect(pruned).not.toBe(list);
  });
});

describe("visibleNotices", () => {
  it("returns [] when there are no notices (no notices = empty render)", () => {
    expect(visibleNotices([], NOW)).toEqual([]);
  });

  it("excludes expired notices and keeps the live ones", () => {
    let list = addNotice([], "stale", "info", { nowMs: NOW, ttlMs: 100 });
    list = addNotice(list, "live", "warn", { nowMs: NOW, ttlMs: 5_000 });
    const visible = visibleNotices(list, NOW + 200);
    expect(visible.map((n) => n.text)).toEqual(["live"]);
  });

  it("returns [] once every notice has expired", () => {
    const list = addNotice([], "gone", "info", { nowMs: NOW, ttlMs: 100 });
    expect(visibleNotices(list, NOW + 1_000)).toEqual([]);
  });
});

describe("noticeGlyph", () => {
  it("maps each level to its glyph", () => {
    expect(noticeGlyph("success")).toBe(GLYPHS.check);
    expect(noticeGlyph("warn")).toBe(GLYPHS.cross);
    expect(noticeGlyph("info")).toBe(GLYPHS.mid);
  });
});

describe("formatNotice", () => {
  it("renders glyph + text on one line", () => {
    const n = first(addNotice([], "update available", "info", { nowMs: NOW }));
    expect(formatNotice(n)).toBe(`${GLYPHS.mid} update available`);
  });

  it("strips control chars and ANSI escapes (no escape injection)", () => {
    const malicious: Notice = {
      id: "x",
      text: "evil\x1b]0;HIJACKED\x07rest\nmore",
      level: "warn",
      expiresAtMs: NOW + 1_000,
    };
    const out = formatNotice(malicious);
    expect(out).not.toContain("\x1b");
    expect(out).not.toContain("\x07");
    expect(out).not.toContain("\n");
    expect(out).toContain("rest");
    expect(out).toContain("more");
  });

  it("sanitizes text at add time too (defense in depth)", () => {
    const n = first(addNotice([], "a\x07b\x7fc\x00d", "info", { nowMs: NOW }));
    expect(n.text).toBe("a b c d");
    expect(formatNotice(n)).toBe(`${GLYPHS.mid} a b c d`);
  });
});
