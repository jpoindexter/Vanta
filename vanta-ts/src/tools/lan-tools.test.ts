import { describe, it, expect } from "vitest";
import { lanDiscoverTool, detectSubnetBase } from "./lan-discover.js";
import { buildLanControlTool } from "./lan-control.js";
import type { ControlSender } from "../reach/lan-control.js";
import type { ToolContext } from "./types.js";

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    root: "/tmp",
    safety: {} as ToolContext["safety"],
    requestApproval: async () => true,
    ...overrides,
  };
}

describe("lan_discover tool", () => {
  it("describeForSafety reads as read-only (kernel Allow)", () => {
    expect(lanDiscoverTool.describeForSafety!({ subnet: "192.168.1" })).toContain("read-only");
  });

  it("refuses a non-private subnet without touching the network", async () => {
    const res = await lanDiscoverTool.execute({ subnet: "8.8.8" }, ctx());
    expect(res.ok).toBe(false);
    expect(res.output).toContain("non-private");
  });

  it("rejects malformed args", async () => {
    const res = await lanDiscoverTool.execute({ timeoutMs: 1 }, ctx());
    expect(res.ok).toBe(false);
  });

  it("detectSubnetBase returns a /24 base for a private NIC", () => {
    const base = detectSubnetBase({
      en0: [{ address: "192.168.7.20", family: "IPv4", internal: false } as never],
    } as never);
    expect(base).toBe("192.168.7");
  });

  it("detectSubnetBase ignores public + internal interfaces", () => {
    const base = detectSubnetBase({
      lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true } as never],
      en0: [{ address: "8.8.8.8", family: "IPv4", internal: false } as never],
    } as never);
    expect(base).toBeNull();
  });
});

describe("lan_control tool (mocked sender)", () => {
  const fakeSender: ControlSender = async (req) => ({ status: 200, bodySnippet: `did ${req.method}` });

  it("describeForSafety surfaces the target so the kernel Asks", () => {
    const tool = buildLanControlTool(fakeSender);
    const d = tool.describeForSafety!({ url: "http://192.168.1.50:1400/x", method: "POST" });
    expect(d).toContain("control lan device");
    expect(d).toContain("192.168.1.50");
  });

  it("sends a mutating request when approved", async () => {
    const tool = buildLanControlTool(fakeSender);
    const res = await tool.execute({ url: "http://192.168.1.50:1400/cmd", method: "POST", body: "x" }, ctx());
    expect(res.ok).toBe(true);
    expect(res.output).toContain("200");
    expect(res.output).toContain("did POST");
  });

  it("does not send when the human denies approval", async () => {
    let sent = false;
    const sender: ControlSender = async () => {
      sent = true;
      return { status: 200, bodySnippet: "" };
    };
    const tool = buildLanControlTool(sender);
    const res = await tool.execute({ url: "http://192.168.1.50:1400/cmd" }, ctx({ requestApproval: async () => false }));
    expect(res.ok).toBe(false);
    expect(res.output).toBe("denied");
    expect(sent).toBe(false);
  });

  it("refuses a non-LAN target even with auto-approval", async () => {
    let sent = false;
    const sender: ControlSender = async () => {
      sent = true;
      return { status: 200, bodySnippet: "" };
    };
    const tool = buildLanControlTool(sender);
    const res = await tool.execute({ url: "http://8.8.8.8/cmd", method: "POST" }, ctx());
    expect(res.ok).toBe(false);
    expect(res.output).toContain("non-LAN");
    expect(sent).toBe(false);
  });

  it("rejects a missing url", async () => {
    const tool = buildLanControlTool(fakeSender);
    const res = await tool.execute({ method: "POST" }, ctx());
    expect(res.ok).toBe(false);
  });
});
