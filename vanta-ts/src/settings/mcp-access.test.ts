import { describe, it, expect } from "vitest";
import {
  McpAccessSchema,
  mcpAutoMountEnabled,
  serverAccessDecision,
  filterMountableServers,
} from "./mcp-access.js";

describe("McpAccessSchema — shape", () => {
  it("accepts an allow list", () => {
    const parsed = McpAccessSchema.safeParse({ allow: ["fs", "git"] });
    expect(parsed.success).toBe(true);
  });

  it("accepts a deny list", () => {
    const parsed = McpAccessSchema.safeParse({ deny: ["scary"] });
    expect(parsed.success).toBe(true);
  });

  it("accepts both lists together", () => {
    const parsed = McpAccessSchema.safeParse({ allow: ["fs"], deny: ["scary"] });
    expect(parsed.success).toBe(true);
  });

  it("accepts the explicit startup-mount switch", () => {
    expect(McpAccessSchema.safeParse({ autoMount: true }).success).toBe(true);
  });

  it("accepts an empty object (absent → all mount)", () => {
    expect(McpAccessSchema.safeParse({}).success).toBe(true);
  });

  it("rejects unknown keys (strict)", () => {
    expect(McpAccessSchema.safeParse({ allowed: ["fs"] }).success).toBe(false);
  });
});

describe("mcpAutoMountEnabled — startup is opt-in", () => {
  it("keeps configured connectors dormant by default", () => {
    expect(mcpAutoMountEnabled({}, {})).toBe(false);
  });

  it("accepts a settings opt-in", () => {
    expect(mcpAutoMountEnabled({ autoMount: true }, {})).toBe(true);
  });

  it("lets the environment explicitly enable or disable settings", () => {
    expect(mcpAutoMountEnabled({}, { VANTA_MCP_AUTO_MOUNT: "on" })).toBe(true);
    expect(mcpAutoMountEnabled({ autoMount: true }, { VANTA_MCP_AUTO_MOUNT: "0" })).toBe(false);
  });
});

describe("serverAccessDecision — deny wins, allowlist restricts", () => {
  it("denies a server on the deny list", () => {
    expect(serverAccessDecision("scary", { deny: ["scary"] })).toBe("deny");
  });

  it("denies even when the server is ALSO allowed (deny wins)", () => {
    expect(
      serverAccessDecision("scary", { allow: ["scary"], deny: ["scary"] }),
    ).toBe("deny");
  });

  it("allows a server on the allow list", () => {
    expect(serverAccessDecision("fs", { allow: ["fs", "git"] })).toBe("allow");
  });

  it("denies a server NOT on the allow list when an allowlist is present", () => {
    expect(serverAccessDecision("scary", { allow: ["fs", "git"] })).toBe("deny");
  });

  it("allows any server when neither list is set (today's behavior)", () => {
    expect(serverAccessDecision("anything", {})).toBe("allow");
  });

  it("allows any server when only an (empty) deny list is set", () => {
    expect(serverAccessDecision("fs", { deny: [] })).toBe("allow");
  });

  it("treats an empty/blank allow list as no allowlist (does not deny all)", () => {
    expect(serverAccessDecision("fs", { allow: [] })).toBe("allow");
    expect(serverAccessDecision("fs", { allow: ["   "] })).toBe("allow");
  });

  it("ignores surrounding whitespace in list entries and the name", () => {
    expect(serverAccessDecision(" fs ", { allow: ["fs"] })).toBe("allow");
    expect(serverAccessDecision("scary", { deny: [" scary "] })).toBe("deny");
  });

  it("is case-sensitive (server names are exact)", () => {
    expect(serverAccessDecision("FS", { allow: ["fs"] })).toBe("deny");
  });
});

describe("filterMountableServers — returns only permitted names", () => {
  it("returns all names when policy is absent/empty", () => {
    expect(filterMountableServers(["fs", "git", "web"], {})).toEqual([
      "fs",
      "git",
      "web",
    ]);
  });

  it("drops denied names (deny wins)", () => {
    expect(
      filterMountableServers(["fs", "scary", "git"], { deny: ["scary"] }),
    ).toEqual(["fs", "git"]);
  });

  it("restricts to the allowlist when one is present", () => {
    expect(
      filterMountableServers(["fs", "git", "web"], { allow: ["fs", "web"] }),
    ).toEqual(["fs", "web"]);
  });

  it("applies deny over allow for a name on both lists", () => {
    expect(
      filterMountableServers(["fs", "git"], { allow: ["fs", "git"], deny: ["git"] }),
    ).toEqual(["fs"]);
  });

  it("preserves input order", () => {
    expect(
      filterMountableServers(["web", "fs", "git"], { allow: ["git", "fs", "web"] }),
    ).toEqual(["web", "fs", "git"]);
  });

  it("returns [] when an allowlist matches none of the configured servers", () => {
    expect(filterMountableServers(["fs", "git"], { allow: ["other"] })).toEqual([]);
  });
});
