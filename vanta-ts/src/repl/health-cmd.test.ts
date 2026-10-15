import { describe, it, expect } from "vitest";
import { formatHealth, googleCap, searchCap, visionCap, type Cap } from "./health-cmd.js";

describe("formatHealth", () => {
  it("renders ✓/✗ per capability + the fix only for the missing ones", () => {
    const caps: Cap[] = [
      { name: "kernel", ok: true, detail: "up" },
      { name: "vision", ok: false, detail: "main model", fix: "set VANTA_VISION_MODEL" },
    ];
    const out = formatHealth(caps);
    expect(out).toContain("1 need setup");
    expect(out).toContain("✓ kernel");
    expect(out).toContain("✗ vision");
    expect(out).toContain("→ set VANTA_VISION_MODEL");
    // a ready cap (kernel) has no fix arrow on its own line
    expect(out.split("\n").find((l) => l.includes("kernel"))).not.toContain("→");
  });

  it("reports all-ready when nothing is missing", () => {
    expect(formatHealth([{ name: "web search", ok: true, detail: "keyless" }])).toContain("all ready");
  });
});

describe("googleCap", () => {
  it("no OAuth client → points at the supported client-file setup", async () => {
    const c = await googleCap({} as NodeJS.ProcessEnv, {
      hasClient: async () => false,
      hasAuth: async () => false,
    });
    expect(c.ok).toBe(false);
    expect(c.fix).toContain("vanta auth google gmail --client");
  });

  it("stored client but no grants → points at each independent service", async () => {
    const c = await googleCap({} as NodeJS.ProcessEnv, {
      hasClient: async () => true,
      hasAuth: async () => false,
    });
    expect(c.ok).toBe(false);
    expect(c.detail).toBe("not authorized");
    expect(c.fix).toContain("vanta auth google gmail");
    expect(c.fix).toContain("vanta auth google calendar");
    expect(c.fix).toContain("vanta auth google drive");
  });

  it("reports partial grants without collapsing them into one Google claim", async () => {
    const c = await googleCap({} as NodeJS.ProcessEnv, {
      hasClient: async () => true,
      hasAuth: async (_env, service) => service === "gmail",
    });
    expect(c.ok).toBe(false);
    expect(c.detail).toBe("gmail authorized; calendar/drive not authorized");
    expect(c.fix).not.toContain("vanta auth google gmail");
    expect(c.fix).toContain("vanta auth google calendar");
  });

  it("is ready only when all three independent grants exist", async () => {
    const c = await googleCap({} as NodeJS.ProcessEnv, {
      hasClient: async () => true,
      hasAuth: async () => true,
    });
    expect(c).toMatchObject({ ok: true, detail: "gmail/calendar/drive authorized" });
    expect(c.fix).toBeUndefined();
  });
});

describe("searchCap", () => {
  it("labels zero-config automatic routing as best effort", () => {
    expect(searchCap({} as NodeJS.ProcessEnv)).toMatchObject({ ok: true, detail: expect.stringMatching(/best-effort.*Brave browser.*Bing/i) });
  });

  it("marks an explicit DDG-derived selection degraded with an actionable fix", () => {
    const cap = searchCap({ VANTA_SEARCH_PROVIDER: "ddg" } as NodeJS.ProcessEnv);
    expect(cap).toMatchObject({ ok: false, detail: expect.stringMatching(/bot-blocked/i), fix: expect.stringContaining("auto") });
  });

  it("recognizes a configured managed provider", () => {
    expect(searchCap({ VANTA_SEARCH_PROVIDER: "brave", BRAVE_KEY: "key" } as NodeJS.ProcessEnv))
      .toMatchObject({ ok: true, detail: expect.stringMatching(/configured provider/i) });
  });
});

describe("visionCap", () => {
  it("ready when VANTA_VISION_MODEL is set", () => {
    expect(visionCap({ VANTA_VISION_MODEL: "gpt-4o-mini" } as unknown as NodeJS.ProcessEnv).ok).toBe(true);
  });
  it("missing otherwise, with a fix", () => {
    const c = visionCap({} as NodeJS.ProcessEnv);
    expect(c.ok).toBe(false);
    expect(c.fix).toContain("VANTA_VISION_MODEL");
  });
});
