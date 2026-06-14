import { describe, it, expect } from "vitest";
import {
  auto,
  parseAutoArg,
  buildDirective,
  stripDirective,
  AUTO_MARKER,
  REVIEW_RUBRIC,
} from "./auto-cmd.js";
import type { ReplCtx } from "./types.js";

function mkCtx(content: string | null): ReplCtx {
  const messages = content === null ? [] : [{ role: "system", content }];
  return { convo: { messages } } as unknown as ReplCtx;
}
const sysContent = (ctx: ReplCtx) => (ctx.convo.messages[0] as { content: string }).content;

describe("parseAutoArg", () => {
  it("maps known args; unknown/empty/on default to full", () => {
    expect(parseAutoArg("review")).toBe("review");
    expect(parseAutoArg("off")).toBe("off");
    expect(parseAutoArg("lite")).toBe("lite");
    expect(parseAutoArg("ULTRA")).toBe("ultra");
    expect(parseAutoArg("")).toBe("full");
    expect(parseAutoArg("on")).toBe("full");
    expect(parseAutoArg("wat")).toBe("full");
  });
});

describe("buildDirective / stripDirective", () => {
  it("builds a delimited block and strips it cleanly (idempotent when absent)", () => {
    const base = "SYSTEM PROMPT";
    const withDir = base + buildDirective("full");
    expect(withDir).toContain(AUTO_MARKER);
    expect(withDir).toContain("do the least that works");
    expect(stripDirective(withDir)).toBe(base);
    expect(stripDirective(base)).toBe(base);
  });
});

describe("/auto handler", () => {
  it("review → resends the deletion rubric, leaves the prompt untouched", async () => {
    const ctx = mkCtx("BASE");
    const r = await auto("review", ctx);
    expect(r).toEqual({ resend: REVIEW_RUBRIC });
    expect(sysContent(ctx)).toBe("BASE");
  });

  it("turns the mode on by injecting the directive once", async () => {
    const ctx = mkCtx("BASE");
    const r = await auto("full", ctx);
    expect(r.output).toContain("ON");
    expect(sysContent(ctx)).toContain(AUTO_MARKER);
  });

  it("switching intensity does not duplicate the block", async () => {
    const ctx = mkCtx("BASE");
    await auto("full", ctx);
    await auto("ultra", ctx);
    const content = sysContent(ctx);
    expect(content.split(AUTO_MARKER).length - 1).toBe(1);
    expect(content).toContain("ultra");
  });

  it("off removes the directive and reports state (and 'already off' when clean)", async () => {
    const ctx = mkCtx("BASE");
    await auto("full", ctx);
    const off = await auto("off", ctx);
    expect(off.output).toContain("OFF");
    expect(sysContent(ctx)).toBe("BASE");
    expect((await auto("off", ctx)).output).toContain("already off");
  });

  it("reports unavailable when there is no system message", async () => {
    const r = await auto("full", mkCtx(null));
    expect(r.output).toContain("unavailable");
  });
});
