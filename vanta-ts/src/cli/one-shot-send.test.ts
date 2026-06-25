import { describe, it, expect, afterEach } from "vitest";
import { buildOneShotSendText } from "./commands.js";

const orig = process.env.VANTA_AGENT_ROUTE;
afterEach(() => { if (orig === undefined) delete process.env.VANTA_AGENT_ROUTE; else process.env.VANTA_AGENT_ROUTE = orig; });

describe("buildOneShotSendText — route hint in the one-shot path", () => {
  it("prepends the call_agent route hint for cross-agent intent", () => {
    delete process.env.VANTA_AGENT_ROUTE;
    const sent = buildOneShotSendText("talk to claude code");
    expect(sent).toContain("call_agent");
    expect(sent).toContain("talk to claude code"); // original instruction preserved
  });

  it("leaves a normal instruction unchanged (no route hint)", () => {
    delete process.env.VANTA_AGENT_ROUTE;
    expect(buildOneShotSendText("what is 2+2?")).toBe("what is 2+2?");
  });

  it("VANTA_AGENT_ROUTE=0 disables the hint", () => {
    process.env.VANTA_AGENT_ROUTE = "0";
    expect(buildOneShotSendText("talk to claude code")).toBe("talk to claude code");
  });
});
