import { describe, it, expect } from "vitest";
import { assertHookUrlAllowed, isHookGuardEnabled } from "./hook-ssrf.js";
import type { Resolver } from "../net/ssrf-guard.js";

// An offline resolver: maps each host to a fixed IP so DNS-rebind and resolved
// private hosts can be tested without network access.
const resolverFor = (ip: string): Resolver => async () => [ip];
const publicResolver: Resolver = async () => ["93.184.216.34"]; // example.com

describe("assertHookUrlAllowed", () => {
  it("allows a normal public URL", async () => {
    const r = await assertHookUrlAllowed("https://hooks.example.com/post", {
      resolver: publicResolver,
      env: {},
    });
    expect(r.ok).toBe(true);
  });

  it("blocks a loopback literal (127.0.0.1)", async () => {
    const r = await assertHookUrlAllowed("http://127.0.0.1:7788/api/log", { env: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/hook SSRF guard/);
  });

  it("blocks IPv6 loopback (::1)", async () => {
    const r = await assertHookUrlAllowed("http://[::1]:8080/x", { env: {} });
    expect(r.ok).toBe(false);
  });

  it("blocks a private literal (10.0.0.5)", async () => {
    const r = await assertHookUrlAllowed("http://10.0.0.5/notify", { env: {} });
    expect(r.ok).toBe(false);
  });

  it("blocks a private literal (192.168.1.20)", async () => {
    const r = await assertHookUrlAllowed("http://192.168.1.20/notify", { env: {} });
    expect(r.ok).toBe(false);
  });

  it("blocks a private literal in the 172.16/12 range", async () => {
    const r = await assertHookUrlAllowed("http://172.16.4.4/notify", { env: {} });
    expect(r.ok).toBe(false);
  });

  it("blocks the cloud-metadata IP (169.254.169.254)", async () => {
    const r = await assertHookUrlAllowed("http://169.254.169.254/latest/meta-data/", {
      env: {},
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/169\.254\.169\.254/);
  });

  it("blocks a link-local literal (169.254.0.1)", async () => {
    const r = await assertHookUrlAllowed("http://169.254.0.1/x", { env: {} });
    expect(r.ok).toBe(false);
  });

  it("blocks a public-looking host that resolves to the metadata IP (DNS rebind)", async () => {
    const r = await assertHookUrlAllowed("https://evil.example.com/x", {
      resolver: resolverFor("169.254.169.254"),
      env: {},
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/169\.254\.169\.254/);
  });

  it("blocks a public-looking host that resolves to a private IP", async () => {
    const r = await assertHookUrlAllowed("https://internal.example.com/x", {
      resolver: resolverFor("10.1.2.3"),
      env: {},
    });
    expect(r.ok).toBe(false);
  });

  it("blocks a malformed URL", async () => {
    const r = await assertHookUrlAllowed("not a url", { env: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/hook SSRF guard/);
  });

  it("blocks a non-HTTP scheme (file://)", async () => {
    const r = await assertHookUrlAllowed("file:///etc/passwd", { env: {} });
    expect(r.ok).toBe(false);
  });

  it("allows a private target when VANTA_HOOK_ALLOW_PRIVATE=1 (opt-out)", async () => {
    const r = await assertHookUrlAllowed("http://127.0.0.1:7788/api/log", {
      env: { VANTA_HOOK_ALLOW_PRIVATE: "1" },
    });
    expect(r.ok).toBe(true);
  });

  it("opt-out is independent of the web-fetch flag (VANTA_ALLOW_PRIVATE_FETCH ignored)", async () => {
    // Setting only the web-fetch flag must NOT bypass the hook guard.
    const r = await assertHookUrlAllowed("http://10.0.0.5/notify", {
      env: { VANTA_ALLOW_PRIVATE_FETCH: "1" },
    });
    expect(r.ok).toBe(false);
  });
});

describe("isHookGuardEnabled", () => {
  it("is on by default", () => {
    expect(isHookGuardEnabled({})).toBe(true);
  });

  it("is off only when VANTA_HOOK_ALLOW_PRIVATE=1", () => {
    expect(isHookGuardEnabled({ VANTA_HOOK_ALLOW_PRIVATE: "1" })).toBe(false);
    expect(isHookGuardEnabled({ VANTA_HOOK_ALLOW_PRIVATE: "true" })).toBe(true);
  });
});
