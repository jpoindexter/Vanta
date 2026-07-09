import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authenticateCompanion, exchangeCompanionCode, listCompanionDevices, startCompanionPairing } from "./auth.js";

let home: string;
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), "vanta-companion-")); });
afterEach(async () => rm(home, { recursive: true, force: true }));

describe("companion auth", () => {
  it("exchanges a one-time code for a persisted high-entropy token", async () => {
    const pairing = await startCompanionPairing(home, 1_000, () => 0);
    const result = await exchangeCompanionCode(home, pairing.code, "Jason's phone", 2_000);
    expect("token" in result && result.token.length).toBeGreaterThan(40);
    if (!("token" in result)) return;
    expect(await authenticateCompanion(home, result.token, 63_000)).toMatchObject({ name: "Jason's phone", lastSeenAt: new Date(63_000).toISOString() });
    expect(await listCompanionDevices(home)).toHaveLength(1);
    expect(await readFile(join(home, "companion-tokens.json"), "utf8")).not.toContain(result.token);
    await expect(exchangeCompanionCode(home, pairing.code, "Second phone", 4_000)).resolves.toEqual({ error: "pairing not started" });
  });

  it("rejects bad and expired codes without issuing a device", async () => {
    const pairing = await startCompanionPairing(home, 1_000, () => 0);
    await expect(exchangeCompanionCode(home, "XXXXXX", "Phone", 2_000)).resolves.toEqual({ error: "incorrect pairing code" });
    await expect(exchangeCompanionCode(home, pairing.code, "Phone", 1_000 + 11 * 60_000)).resolves.toEqual({ error: "pairing code expired" });
    expect(await listCompanionDevices(home)).toEqual([]);
  });

  it("rejects absent and unknown bearer tokens", async () => {
    await expect(authenticateCompanion(home, undefined)).resolves.toBeNull();
    await expect(authenticateCompanion(home, "unknown")).resolves.toBeNull();
  });
});
