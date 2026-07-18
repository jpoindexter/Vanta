import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { deleteSecret, getSecret, setSecret, type KeychainKey } from "./keychain.js";

const keys: KeychainKey[] = [];

afterEach(async () => {
  await Promise.all(keys.splice(0).map((key) => deleteSecret(key)));
});

describe.runIf(process.platform === "darwin")("native macOS Keychain", () => {
  it("stores, reads, updates, and deletes an exact secret", async () => {
    const key = { service: `vanta-native-test-${randomUUID()}`, account: "vanta" };
    keys.push(key);

    expect(await setSecret(key, "first-secret")).toEqual({ ok: true });
    expect(await getSecret(key)).toEqual({ ok: true, value: "first-secret" });
    expect(await setSecret(key, "rotated-secret")).toEqual({ ok: true });
    expect(await getSecret(key)).toEqual({ ok: true, value: "rotated-secret" });
    expect(await deleteSecret(key)).toEqual({ ok: true });
    expect(await getSecret(key)).toEqual({ ok: true, value: null });
  });
});
