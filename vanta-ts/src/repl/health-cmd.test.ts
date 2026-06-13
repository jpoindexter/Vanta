import { describe, it, expect } from "vitest";
import { formatHealth, googleCap, visionCap, type Cap } from "./health-cmd.js";

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
  const home = "/tmp/nonexistent-vanta-home"; // no google-tokens.json there

  it("no OAuth client → points at the client-id setup", () => {
    const c = googleCap({} as NodeJS.ProcessEnv, home);
    expect(c.ok).toBe(false);
    expect(c.fix).toContain("VANTA_GOOGLE_CLIENT_ID");
  });

  it("creds present but no token → points at vanta auth google", () => {
    const c = googleCap({ VANTA_GOOGLE_CLIENT_ID: "x", VANTA_GOOGLE_CLIENT_SECRET: "y" } as unknown as NodeJS.ProcessEnv, home);
    expect(c.ok).toBe(false);
    expect(c.fix).toBe("run: vanta auth google");
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
