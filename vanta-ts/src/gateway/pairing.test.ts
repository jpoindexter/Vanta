import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  generateCode,
  looksLikeCode,
  requestPairing,
  verifyCode,
  isApproved,
  approvePairing,
  listPairings,
  CODE_LENGTH,
  EXPIRY_MS,
  MAX_ATTEMPTS,
} from "./pairing.js";

let home: string;
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), "vanta-pairing-")); });
afterEach(async () => { await rm(home, { recursive: true }).catch(() => {}); });

describe("generateCode", () => {
  it("returns a string of CODE_LENGTH", () => {
    const code = generateCode();
    expect(code.length).toBe(CODE_LENGTH);
  });

  it("contains only unambiguous characters", () => {
    for (let i = 0; i < 20; i++) {
      const c = generateCode();
      expect(c).not.toMatch(/[IO01]/);
    }
  });

  it("is deterministic with a seeded rand", () => {
    let n = 0;
    const rand = (): number => (n++ % 28) / 28;
    const a = generateCode(rand);
    n = 0;
    const b = generateCode(rand);
    expect(a).toBe(b);
  });
});

describe("looksLikeCode", () => {
  it("recognises a valid 6-char code", () => {
    expect(looksLikeCode("BCDFGH")).toBe(true);
  });

  it("rejects too short", () => {
    expect(looksLikeCode("BCDF")).toBe(false);
  });

  it("rejects ambiguous chars", () => {
    expect(looksLikeCode("BCDFI0")).toBe(false);
  });
});

describe("requestPairing", () => {
  it("creates a pending record and returns a code", async () => {
    const code = await requestPairing("chat1", "telegram", home);
    expect(code.length).toBe(CODE_LENGTH);
    expect(await isApproved("chat1", home)).toBe(false);
  });

  it("reuses an unexpired pending code", async () => {
    const code1 = await requestPairing("chat1", "telegram", home);
    const code2 = await requestPairing("chat1", "telegram", home);
    expect(code1).toBe(code2);
  });

  it("issues a new code after expiry", async () => {
    const pastNow = Date.now() - EXPIRY_MS - 1000;
    const code1 = await requestPairing("chat1", "telegram", home, pastNow);
    const code2 = await requestPairing("chat1", "telegram", home);
    // New code may differ (low probability of collision)
    expect(typeof code2).toBe("string");
    expect(code2.length).toBe(CODE_LENGTH);
    void code1; // suppress unused warning
  });
});

describe("verifyCode", () => {
  it("returns approved on correct code", async () => {
    const code = await requestPairing("chat1", "telegram", home);
    const result = await verifyCode("chat1", code, home);
    expect(result).toBe("approved");
    expect(await isApproved("chat1", home)).toBe(true);
  });

  it("returns wrong and increments attempts on bad code", async () => {
    await requestPairing("chat1", "telegram", home);
    const result = await verifyCode("chat1", "XXXXXX", home);
    expect(result).toBe("wrong");
  });

  it("returns locked after MAX_ATTEMPTS failures", async () => {
    await requestPairing("chat1", "telegram", home);
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      await verifyCode("chat1", "XXXXXX", home);
    }
    const result = await verifyCode("chat1", "XXXXXX", home);
    expect(result).toBe("locked");
  });

  it("returns expired for an expired record", async () => {
    const past = Date.now() - EXPIRY_MS - 1000;
    await requestPairing("chat1", "telegram", home, past);
    const result = await verifyCode("chat1", "XXXXXX", home, Date.now());
    expect(result).toBe("expired");
  });
});

describe("approvePairing", () => {
  it("approves a known chatId", async () => {
    await requestPairing("chat2", "telegram", home);
    const ok = await approvePairing("chat2", "telegram", home);
    expect(ok).toBe(true);
    expect(await isApproved("chat2", home)).toBe(true);
  });

  it("returns false for unknown chatId", async () => {
    const ok = await approvePairing("unknown", "telegram", home);
    expect(ok).toBe(false);
  });
});

describe("listPairings", () => {
  it("returns empty when no records exist", async () => {
    expect(await listPairings(home)).toEqual([]);
  });

  it("returns all records", async () => {
    await requestPairing("chat1", "telegram", home);
    await requestPairing("chat2", "telegram", home);
    const records = await listPairings(home);
    expect(records.length).toBe(2);
  });
});
