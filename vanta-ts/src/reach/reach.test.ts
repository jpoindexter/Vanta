import { describe, it, expect } from "vitest";
import { orderedBackends, type ReachChannel } from "./channel.js";
import { resolveChannel, checkAll, REACH_CHANNELS } from "./registry.js";
import { formatDoctor } from "./doctor.js";

const fake: ReachChannel = {
  name: "reddit",
  description: "x",
  backends: ["opencli", "rdt-cli"],
  tier: 2,
  canHandle: (u) => u.includes("reddit.com"),
  async check() {
    return { name: "reddit", status: "off", activeBackend: null, detail: "no login", fix: "rdt login" };
  },
};

describe("orderedBackends", () => {
  it("keeps declared order with no override", () => {
    expect(orderedBackends(fake, {})).toEqual(["opencli", "rdt-cli"]);
  });

  it("moves the <NAME>_BACKEND override to the front", () => {
    expect(orderedBackends(fake, { REDDIT_BACKEND: "rdt-cli" })).toEqual(["rdt-cli", "opencli"]);
  });

  it("ignores an unknown override (never hides working backends)", () => {
    expect(orderedBackends(fake, { REDDIT_BACKEND: "ghost" })).toEqual(["opencli", "rdt-cli"]);
  });
});

describe("resolveChannel", () => {
  it("routes a web URL to the web channel", () => {
    expect(resolveChannel("https://example.com")?.name).toBe("web");
  });

  it("routes a reddit URL to a reddit channel when registered", () => {
    expect(resolveChannel("https://reddit.com/r/x", [fake])?.name).toBe("reddit");
  });

  it("returns undefined for an unhandled URL", () => {
    expect(resolveChannel("ftp://nope", [fake])).toBeUndefined();
  });
});

describe("checkAll + formatDoctor", () => {
  it("returns a status for every seed channel", async () => {
    const statuses = await checkAll({}, REACH_CHANNELS);
    expect(statuses.map((s) => s.name).sort()).toEqual(["search", "web"]);
    expect(statuses.every((s) => s.status === "ok")).toBe(true);
  });

  it("renders an off channel with its fix line", () => {
    const out = formatDoctor([
      { name: "web", status: "ok", activeBackend: "web_fetch", detail: "built-in" },
      { name: "reddit", status: "off", activeBackend: null, detail: "no login", fix: "rdt login" },
    ]);
    expect(out).toContain("1/2 channel(s) unreachable");
    expect(out).toContain("✘ reddit");
    expect(out).toContain("fix: rdt login");
  });

  it("a check that throws degrades to off, never rejects", async () => {
    const boom: ReachChannel = { ...fake, name: "boom", check: async () => { throw new Error("kaboom"); } };
    const [s] = await checkAll({}, [boom]);
    expect(s?.status).toBe("off");
    expect(s?.detail).toContain("kaboom");
  });
});
