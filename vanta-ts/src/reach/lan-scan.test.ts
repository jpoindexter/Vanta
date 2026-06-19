import { describe, it, expect } from "vitest";
import {
  isPrivateIpv4,
  hostsForSubnet24,
  devicesFromProbes,
  scanSubnet,
  formatDevices,
  type HostProber,
  type ProbeResult,
} from "./lan-scan.js";
import {
  checkLanTarget,
  hostFromUrl,
  describeControl,
  sendControl,
  type ControlSender,
} from "./lan-control.js";

describe("isPrivateIpv4", () => {
  it("accepts RFC-1918 + loopback ranges", () => {
    expect(isPrivateIpv4("192.168.1.50")).toBe(true);
    expect(isPrivateIpv4("10.0.0.4")).toBe(true);
    expect(isPrivateIpv4("172.16.5.9")).toBe(true);
    expect(isPrivateIpv4("172.31.255.1")).toBe(true);
    expect(isPrivateIpv4("127.0.0.1")).toBe(true);
  });
  it("rejects public + edge ranges", () => {
    expect(isPrivateIpv4("8.8.8.8")).toBe(false);
    expect(isPrivateIpv4("172.15.0.1")).toBe(false);
    expect(isPrivateIpv4("172.32.0.1")).toBe(false);
  });
});

describe("hostsForSubnet24", () => {
  it("expands a private /24 to .1–.254", () => {
    const r = hostsForSubnet24("192.168.1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.hosts).toHaveLength(254);
      expect(r.hosts[0]).toBe("192.168.1.1");
      expect(r.hosts.at(-1)).toBe("192.168.1.254");
    }
  });
  it("tolerates a trailing dot", () => {
    expect(hostsForSubnet24("10.0.0.").ok).toBe(true);
  });
  it("refuses a non-private subnet (LAN only)", () => {
    const r = hostsForSubnet24("8.8.8");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("non-private");
  });
  it("rejects a malformed base", () => {
    expect(hostsForSubnet24("not.an.ip.x").ok).toBe(false);
  });
});

describe("devicesFromProbes", () => {
  it("folds only responders into per-host devices with a class guess", () => {
    const results: ProbeResult[] = [
      { host: "192.168.1.50", port: 1400, scheme: "http", ok: true, status: 200, banner: "Linux UPnP/1.0 Sonos" },
      { host: "192.168.1.50", port: 80, scheme: "http", ok: true, status: 200 },
      { host: "192.168.1.99", port: 80, scheme: "http", ok: false },
    ];
    const devices = devicesFromProbes(results);
    expect(devices).toHaveLength(1);
    expect(devices[0]!.host).toBe("192.168.1.50");
    expect(devices[0]!.guess).toBe("sonos"); // specific port wins over generic http-device
    expect(devices[0]!.endpoints).toHaveLength(2);
  });
});

describe("scanSubnet (mocked network)", () => {
  it("uses the injected prober — no real network — and finds devices", async () => {
    const calls: string[] = [];
    const fakeProber: HostProber = async (host, hint) => {
      calls.push(`${host}:${hint.port}`);
      const ok = host === "192.168.1.50" && hint.port === 1400;
      return { host, port: hint.port, scheme: hint.scheme, ok, status: ok ? 200 : undefined, banner: ok ? "Sonos" : undefined };
    };
    const r = await scanSubnet({ base: "192.168.1", prober: fakeProber, hints: [{ port: 1400, scheme: "http", kind: "sonos" }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.devices).toHaveLength(1);
      expect(r.devices[0]!.guess).toBe("sonos");
    }
    expect(calls).toContain("192.168.1.50:1400");
    expect(calls).toHaveLength(254);
  });

  it("refuses to scan a non-LAN subnet before probing", async () => {
    let probed = false;
    const prober: HostProber = async (host, hint) => {
      probed = true;
      return { host, port: hint.port, scheme: hint.scheme, ok: false };
    };
    const r = await scanSubnet({ base: "8.8.8", prober });
    expect(r.ok).toBe(false);
    expect(probed).toBe(false);
  });
});

describe("formatDevices", () => {
  it("reports an empty scan", () => {
    expect(formatDevices("192.168.1", [])).toContain("no responding devices");
  });
  it("lists devices with endpoints + banners", () => {
    const out = formatDevices("192.168.1", [
      { host: "192.168.1.50", guess: "sonos", endpoints: [{ url: "http://192.168.1.50:1400", kind: "sonos", banner: "Sonos" }] },
    ]);
    expect(out).toContain("192.168.1.50 [sonos]");
    expect(out).toContain("(Sonos)");
  });
});

describe("lan-control core", () => {
  it("extracts host + rejects non-http schemes", () => {
    expect(hostFromUrl("http://192.168.1.50:1400/x")).toBe("192.168.1.50");
    expect(hostFromUrl("ftp://192.168.1.50/x")).toBeNull();
    expect(hostFromUrl("nonsense")).toBeNull();
  });
  it("allows a LAN target, refuses a public one", () => {
    expect(checkLanTarget("http://192.168.1.50:1400/x").ok).toBe(true);
    const bad = checkLanTarget("http://8.8.8.8/x");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain("non-LAN");
  });
  it("describes the action without leaking the body content", () => {
    const d = describeControl({ url: "http://192.168.1.50/x", method: "POST", body: "secret-payload" });
    expect(d).toContain("POST http://192.168.1.50/x");
    expect(d).toContain("14-byte body");
    expect(d).not.toContain("secret-payload");
  });

  it("sendControl uses the injected sender (mocked network) for a LAN target", async () => {
    let sent: string | null = null;
    const fakeSender: ControlSender = async (req) => {
      sent = req.url;
      return { status: 200, bodySnippet: "ok" };
    };
    const r = await sendControl({ url: "http://192.168.1.50:1400/cmd", method: "POST", body: "x" }, fakeSender, 1000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result.status).toBe(200);
    expect(sent).toBe("http://192.168.1.50:1400/cmd");
  });

  it("sendControl refuses a non-LAN target before calling the sender", async () => {
    let called = false;
    const fakeSender: ControlSender = async () => {
      called = true;
      return { status: 200, bodySnippet: "" };
    };
    const r = await sendControl({ url: "http://1.2.3.4/cmd", method: "POST" }, fakeSender, 1000);
    expect(r.ok).toBe(false);
    expect(called).toBe(false);
  });
});
