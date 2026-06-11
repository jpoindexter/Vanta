import { describe, it, expect } from "vitest";
import { render } from "./test-render.js";
import { Banner, borderTitle, gatherBannerData, shortPath, type BannerData } from "./banner.js";
import { EntryRow } from "./transcript.js";
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
    expect(frame).toContain("Vanta");
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

describe("borderTitle", () => {
  it("builds a title-in-border top line exactly `width` chars wide", () => {
    const t = borderTitle("Vanta · trusted operator", 60);
    const line = t.pre + t.text + t.post;
    expect(line).toHaveLength(60);
    expect(line).toMatch(/^╭─ Vanta · trusted operator ─+╮$/);
  });

  it("clips an overlong title and still hits the exact width", () => {
    const t = borderTitle("x".repeat(100), 30);
    expect(t.pre + t.text + t.post).toHaveLength(30);
    expect(t.text.endsWith("…")).toBe(true);
  });
});

describe("shortPath", () => {
  it("replaces the home prefix with ~ and left-clips long paths", () => {
    const home = process.env.HOME ?? "/home/u";
    expect(shortPath(`${home}/Documents/x`)).toBe("~/Documents/x");
    const long = shortPath(`${home}/a/${"d".repeat(40)}/end`, 16);
    expect(long.length).toBeLessThanOrEqual(16);
    expect(long.startsWith("…")).toBe(true);
  });
});

describe("banner as a transcript entry (alt-screen)", () => {
  it("EntryRow renders the full designed card for kind=banner", () => {
    const { lastFrame, unmount } = render(<EntryRow entry={{ kind: "banner", data, root: "/tmp/proj" }} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("╭─ Vanta · trusted operator");
    expect(frame).toContain("Capabilities");
    unmount();
  });

  it("renders two columns on wide terminals and stacks on narrow ones", () => {
    const prev = process.stdout.columns;
    process.stdout.columns = 120;
    const wide = render(<Banner data={data} root="/tmp/proj" />);
    const wideFrame = wide.lastFrame() ?? "";
    wide.unmount();
    process.stdout.columns = 60;
    const narrow = render(<Banner data={data} root="/tmp/proj" />);
    const narrowFrame = narrow.lastFrame() ?? "";
    narrow.unmount();
    process.stdout.columns = prev;
    expect(wideFrame).not.toBe(narrowFrame);
    expect(wideFrame).toContain("⚓ Vanta");
    expect(narrowFrame).toContain("⚓ Vanta");
  });
});

describe("gatherBannerData", () => {
  it("reads tool names + prompt size straight off the setup, never throws", async () => {
    const setup = {
      provider: { modelId: () => "fake-model", contextWindow: () => 128_000 },
      registry: { schemas: () => [{ name: "read_file" }, { name: "ls" }] },
      systemPrompt: "x".repeat(120),
    } as unknown as RunSetup;

    const out = await gatherBannerData(setup, "sess-1", { VANTA_HOME: "/nonexistent-xyz" } as NodeJS.ProcessEnv);
    expect(out.model).toBe("fake-model");
    expect(out.toolNames).toEqual(["read_file", "ls"]);
    expect(out.promptChars).toBe(120);
    expect(out.skillCount).not.toBeNull();
    expect(Array.isArray(out.mcpServers)).toBe(true);
  });
});
