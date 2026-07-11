import { describe, expect, it } from "vitest";
import { buildContextInspection, inspectContextTool } from "./inspect-context.js";
import type { Message } from "../types.js";

describe("buildContextInspection", () => {
  it("measures messages, role totals, tool schemas, and utilization without content", () => {
    const messages: Message[] = [
      { role: "system", content: "system secret marker ".repeat(20) },
      { role: "user", content: "measure this session" },
      { role: "assistant", content: "working" },
    ];
    const snapshot = buildContextInspection(messages, [
      { name: "inspect_context", description: "measure context", parameters: { type: "object", properties: {} } },
    ], 10_000);

    expect(snapshot.messageCount).toBe(3);
    expect(snapshot.toolCount).toBe(1);
    expect(snapshot.estimatedTokens).toBeGreaterThan(snapshot.toolSchemaTokens);
    expect(snapshot.byRole.system?.tokens).toBeGreaterThan(snapshot.byRole.user?.tokens ?? 0);
    expect(snapshot.largestMessages[0]).toMatchObject({ role: "system", index: 0 });
    expect(snapshot.rankedSurfaces[0]?.source).toBe("system_messages");
    expect(snapshot.rankedSurfaces.map((surface) => surface.tokens))
      .toEqual([...snapshot.rankedSurfaces.map((surface) => surface.tokens)].sort((a, b) => b - a));
    expect(snapshot.topThreeMeasuredSurfaces).toEqual(snapshot.rankedSurfaces.filter((surface) => surface.tokens > 0).slice(0, 3));
    expect(JSON.stringify(snapshot)).not.toContain("secret marker");
  });
});

describe("inspectContextTool", () => {
  it("returns the live injected snapshot", async () => {
    const expected = buildContextInspection([{ role: "user", content: "hello" }], [], 1_000);
    const result = await inspectContextTool.execute({}, { inspectContext: () => expected } as never);
    expect(result).toEqual({ ok: true, output: JSON.stringify(expected, null, 2) });
  });

  it("fails clearly when a host has no live context callback", async () => {
    const result = await inspectContextTool.execute({}, {} as never);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("not available");
  });
});
