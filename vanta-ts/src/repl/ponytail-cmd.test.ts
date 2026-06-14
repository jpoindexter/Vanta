import { describe, it, expect } from "vitest";
import {
  ponytail,
  parsePonytailArg,
  buildDirective,
  stripDirective,
  PONYTAIL_MARKER,
  REVIEW_RUBRIC,
} from "./ponytail-cmd.js";
import type { ReplCtx } from "./types.js";

function mkCtx(content: string | null): ReplCtx {
  const messages = content === null ? [] : [{ role: "system", content }];
  return { convo: { messages } } as unknown as ReplCtx;
}
const sysContent = (ctx: ReplCtx) => (ctx.convo.messages[0] as { content: string }).content;

describe("parsePonytailArg", () => {
  it("maps known args; unknown/empty/on default to full", () => {
    expect(parsePonytailArg("review")).toBe("review");
    expect(parsePonytailArg("off")).toBe("off");
    expect(parsePonytailArg("lite")).toBe("lite");
    expect(parsePonytailArg("ULTRA")).toBe("ultra");
    expect(parsePonytailArg("")).toBe("full");
    expect(parsePonytailArg("on")).toBe("full");
    expect(parsePonytailArg("wat")).toBe("full");
  });
});

describe("buildDirective / stripDirective", () => {
  it("builds a delimited block and strips it cleanly (idempotent when absent)", () => {
    const base = "SYSTEM PROMPT";
    const withDir = base + buildDirective("full");
    expect(withDir).toContain(PONYTAIL_MARKER);
    expect(withDir).toContain("lazy senior developer");
    expect(stripDirective(withDir)).toBe(base);
    expect(stripDirective(base)).toBe(base);
  });
});

describe("/ponytail handler", () => {
  it("review → resends the deletion rubric, leaves the prompt untouched", async () => {
    const ctx = mkCtx("BASE");
    const r = await ponytail("review", ctx);
    expect(r).toEqual({ resend: REVIEW_RUBRIC });
    expect(sysContent(ctx)).toBe("BASE");
  });

  it("turns the mode on by injecting the directive once", async () => {
    const ctx = mkCtx("BASE");
    const r = await ponytail("full", ctx);
    expect(r.output).toContain("ON");
    expect(sysContent(ctx)).toContain(PONYTAIL_MARKER);
  });

  it("switching intensity does not duplicate the block", async () => {
    const ctx = mkCtx("BASE");
    await ponytail("full", ctx);
    await ponytail("ultra", ctx);
    const content = sysContent(ctx);
    expect(content.split(PONYTAIL_MARKER).length - 1).toBe(1);
    expect(content).toContain("ultra");
  });

  it("off removes the directive and reports state (and 'already off' when clean)", async () => {
    const ctx = mkCtx("BASE");
    await ponytail("full", ctx);
    const off = await ponytail("off", ctx);
    expect(off.output).toContain("OFF");
    expect(sysContent(ctx)).toBe("BASE");
    expect((await ponytail("off", ctx)).output).toContain("already off");
  });

  it("reports unavailable when there is no system message", async () => {
    const r = await ponytail("full", mkCtx(null));
    expect(r.output).toContain("unavailable");
  });
});
