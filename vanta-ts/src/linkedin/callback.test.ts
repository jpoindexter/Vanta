import { afterEach, describe, expect, it } from "vitest";
import type { LinkedInCallback } from "./callback.js";
import { startLinkedInCallback } from "./callback.js";

describe.sequential("LinkedIn loopback callback", () => {
  let callback: LinkedInCallback | null = null;

  afterEach(async () => {
    await callback?.close();
    callback = null;
  });

  it("accepts the exact callback path and matching state", async () => {
    callback = await startLinkedInCallback("expected-state", { port: 0, timeoutMs: 1_000 });
    const result = fetch(`${callback.redirectUri}?code=secret-code&state=expected-state`);
    await expect(callback.code).resolves.toBe("secret-code");
    const response = await result;
    expect(response.status).toBe(200);
    await response.text();
  });

  it("ignores a mismatched state and still accepts the real callback", async () => {
    callback = await startLinkedInCallback("expected-state", { port: 0, timeoutMs: 1_000 });
    const mismatch = await fetch(`${callback.redirectUri}?code=wrong&state=wrong-state`);
    expect(mismatch.status).toBe(400);
    await mismatch.text();
    const result = fetch(`${callback.redirectUri}?code=right&state=expected-state`);
    await expect(callback.code).resolves.toBe("right");
    const response = await result;
    expect(response.status).toBe(200);
    await response.text();
  });

  it("rejects a provider error without exposing a token", async () => {
    callback = await startLinkedInCallback("expected-state", { port: 0, timeoutMs: 1_000 });
    const result = fetch(`${callback.redirectUri}?error=access_denied&state=expected-state`);
    await expect(callback.code).rejects.toThrow("access_denied");
    const response = await result;
    expect(response.status).toBe(200);
    await response.text();
  });
});
