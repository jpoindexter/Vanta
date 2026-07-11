import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { mediaStudioTool } from "./media-studio.js";
import type { ToolContext } from "./types.js";

const brief = { title: "Proof", output: "proof.mp4", width: 640, height: 360, fps: 24, scenes: [{ title: "Opening", duration: 1, background: "#224466" }] };

describe("media_studio tool", () => {
  it("previews without approval", async () => {
    const requestApproval = vi.fn(async () => false);
    const result = await mediaStudioTool.execute({ action: "preview", brief }, { root: "/tmp", safety: {} as never, requestApproval });
    expect(result.ok).toBe(true);
    expect(result.output).toContain("$0.00");
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("does not render when approval is denied", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-media-tool-"));
    const requestApproval = vi.fn(async () => false);
    const result = await mediaStudioTool.execute({ action: "render", brief }, { root, safety: {} as ToolContext["safety"], requestApproval });
    expect(result).toMatchObject({ ok: false });
    expect(result.output).toContain("denied");
    expect(requestApproval).toHaveBeenCalledWith(expect.stringContaining("Opening"), expect.any(String), "media_studio", expect.any(Object));
  });
});
