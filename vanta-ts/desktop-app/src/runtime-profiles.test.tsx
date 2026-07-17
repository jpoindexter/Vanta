import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RuntimeProfilesView } from "./runtime-profiles.js";
import type { RuntimeProfilePayload } from "./types.js";

const gib = 1024 ** 3;
const payload: RuntimeProfilePayload = {
  selectedId: "daily",
  host: { platform: "darwin", architecture: "arm64", memoryBytes: 24 * gib },
  profiles: [{
    profile: {
      version: 2, id: "daily", name: "Daily local", backend: "llama_cpp", policyScope: "ask",
      model: { path: "/models/qwen.gguf", bytes: 8 * gib },
      resources: { contextTokens: 8192, availableMemoryBytes: 24 * gib },
    },
    validation: { valid: true, compatible: true, issues: [] },
    preview: {
      command: "llama-server", args: ["--model", "/models/qwen.gguf"],
      resource: { estimatedMemoryBytes: 9 * gib, availableMemoryBytes: 24 * gib, headroomBytes: 15 * gib, fits: true },
    },
    roundTrip: true,
  }],
};

describe("runtime profiles panel", () => {
  it("keeps required profile evidence visible and advanced creation controls progressively disclosed", () => {
    const html = renderToStaticMarkup(<RuntimeProfilesView payload={payload} onAction={() => undefined} />);
    expect(html).toContain("Profiles");
    expect(html).toContain("Daily local");
    expect(html).toContain("Ready on this host");
    expect(html).toContain("llama-server --model /models/qwen.gguf");
    expect(html).toContain("9.0 GB estimated");
    expect(html).not.toContain("Advanced controls");
  });
});
