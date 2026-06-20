import { describe, it, expect } from "vitest";
import { isBlockedIp, assertPublicUrl, type Resolver } from "./ssrf-guard.js";

// A stub resolver maps a host to fixed IPs so tests never hit real DNS.
const resolveTo =
  (...ips: string[]): Resolver =>
  async () =>
    ips;

const GUARD_OFF = { VANTA_ALLOW_PRIVATE_FETCH: "1" } as NodeJS.ProcessEnv;
const GUARD_ON = {} as NodeJS.ProcessEnv;

const BLOCKED_IPS = [
  "127.0.0.1",
  "127.1.2.3",
  "10.0.0.1",
  "172.16.5.4",
  "172.31.255.255",
  "192.168.1.1",
  "169.254.169.254", // cloud metadata
  "169.254.0.1",
  "0.0.0.0",
  "::1",
  "::",
  "fc00::1",
  "fd12:3456::1",
  "fe80::1",
  "::ffff:127.0.0.1", // IPv4-mapped loopback
];
const PUBLIC_IPS = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:2800:220:1::1", "172.32.0.1", "172.15.0.1"];

describe("isBlockedIp", () => {
  it.each(BLOCKED_IPS)("blocks %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(PUBLIC_IPS)("allows public %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });

  it("returns false for non-IP input (resolution handles hostnames)", () => {
    expect(isBlockedIp("example.com")).toBe(false);
    expect(isBlockedIp("not-an-ip")).toBe(false);
  });
});

describe("assertPublicUrl rejections", () => {
  it("rejects cloud metadata by literal IP", async () => {
    const r = await assertPublicUrl("http://169.254.169.254/latest/meta-data/", { env: GUARD_ON });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("169.254.169.254");
  });

  it("rejects the kernel's own loopback API", async () => {
    const r = await assertPublicUrl("http://127.0.0.1:7788/api/status", { env: GUARD_ON });
    expect(r.ok).toBe(false);
  });

  it("rejects non-http(s) schemes", async () => {
    const r = await assertPublicUrl("file:///etc/passwd", { env: GUARD_ON });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("scheme");
  });

  it("rejects a hostname that resolves to a private address", async () => {
    const r = await assertPublicUrl("http://internal.corp.example", {
      env: GUARD_ON,
      resolver: resolveTo("10.1.2.3"),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("10.1.2.3");
  });

  it("rejects when ANY resolved address is private (rebind defense)", async () => {
    const r = await assertPublicUrl("http://mixed.example", {
      env: GUARD_ON,
      resolver: resolveTo("8.8.8.8", "127.0.0.1"),
    });
    expect(r.ok).toBe(false);
  });

  it("rejects when the host resolves to no addresses", async () => {
    const r = await assertPublicUrl("https://void.example", { env: GUARD_ON, resolver: resolveTo() });
    expect(r.ok).toBe(false);
  });

  it("rejects an unparseable URL", async () => {
    const r = await assertPublicUrl("not a url", { env: GUARD_ON });
    expect(r.ok).toBe(false);
  });
});

describe("assertPublicUrl allows + opt-out", () => {
  it("allows a hostname that resolves to a public address", async () => {
    const r = await assertPublicUrl("https://example.com", {
      env: GUARD_ON,
      resolver: resolveTo("93.184.216.34"),
    });
    expect(r.ok).toBe(true);
  });

  it("allows a public literal IP without resolving", async () => {
    const r = await assertPublicUrl("https://1.1.1.1/", { env: GUARD_ON });
    expect(r.ok).toBe(true);
  });

  it("honors VANTA_ALLOW_PRIVATE_FETCH=1 (opt-out lets a private host through)", async () => {
    const r = await assertPublicUrl("http://127.0.0.1:7788/api/status", { env: GUARD_OFF });
    expect(r.ok).toBe(true);
  });
});
