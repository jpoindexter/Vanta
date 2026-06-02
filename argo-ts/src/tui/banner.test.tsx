import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { Banner, gatherBannerData, type BannerData } from "./banner.js";
import type { RunSetup } from "../session.js";

const data: BannerData = {
  model: "gemini-2.5-flash",
  sessionId: "20260602-200419",
  toolNames: ["read_file", "write_file", "shell_cmd"],
  promptChars: 4812,
  skillCount: 10,
  mcpServers: ["codegraph"],
};

describe("Banner", () => {
  it("renders the wordmark, model, tool count and footer", () => {
    const { lastFrame, unmount } = render(<Banner data={data} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Argo");
    expect(frame).toContain("gemini-2.5-flash");
    expect(frame).toContain("Capabilities");
    expect(frame).toContain("Files"); // domain-grouped
    expect(frame).toContain("read_file");
    expect(frame).toContain("3 tools");
    expect(frame).toContain("/help");
    unmount();
  });

  it("shows a loading ellipsis for not-yet-loaded async counts", () => {
    const { lastFrame, unmount } = render(<Banner data={{ ...data, skillCount: null, mcpServers: null }} />);
    expect(lastFrame() ?? "").toContain("…");
    unmount();
  });
});

describe("gatherBannerData", () => {
  it("reads tool names + prompt size straight off the setup, never throws", async () => {
    const setup = {
      provider: { modelId: () => "fake-model", contextWindow: () => 128_000 },
      registry: { schemas: () => [{ name: "read_file" }, { name: "ls" }] },
      systemPrompt: "x".repeat(120),
    } as unknown as RunSetup;

    const out = await gatherBannerData(setup, "sess-1", { ARGO_HOME: "/nonexistent-xyz" } as NodeJS.ProcessEnv);
    expect(out.model).toBe("fake-model");
    expect(out.toolNames).toEqual(["read_file", "ls"]);
    expect(out.promptChars).toBe(120);
    expect(out.skillCount).not.toBeNull();
    expect(Array.isArray(out.mcpServers)).toBe(true);
  });
});
