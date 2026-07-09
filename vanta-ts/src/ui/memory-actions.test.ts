import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMemoryOverlayData, openMemoryFile } from "./memory-actions.js";

describe("memory overlay actions", () => {
  it("lists session, brain, and goal memory files", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-memory-ui-root-"));
    const home = await mkdtemp(join(tmpdir(), "vanta-memory-ui-home-"));
    await mkdir(join(home, "memories"), { recursive: true });
    await writeFile(join(home, "memories", "7.md"), "## memory\nkeep this\n", "utf8");
    await mkdir(join(root, ".vanta"), { recursive: true });
    await writeFile(join(root, ".vanta", "session-memory.md"), "- now\n", "utf8");

    const data = await loadMemoryOverlayData(root, { VANTA_HOME: home });

    expect(data.rows.some((row) => row.id === "session:scratchpad" && row.exists)).toBe(true);
    expect(data.rows.some((row) => row.id === "brain:semantic" && row.exists)).toBe(true);
    expect(data.rows.some((row) => row.id === "goal:7.md" && row.path.endsWith("memories/7.md"))).toBe(true);
  });

  it("does not open missing files", async () => {
    const message = await openMemoryFile({ id: "x", label: "Missing", source: "session", path: "/nope", detail: "", exists: false });
    expect(message).toBe("Missing has not been written yet");
  });
});
