import { describe, expect, it, vi } from "vitest";
import { RELEASE_PROOFS_USAGE, runReleaseProofsCommand } from "./release-proofs-cmd.js";

describe("release-proofs command", () => {
  it("requires explicit consent before live account calls", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(runReleaseProofsCommand("/unused", ["capture", "codex"])).resolves.toBe(1);
    expect(error).toHaveBeenCalledWith(RELEASE_PROOFS_USAGE);

    error.mockRestore();
  });

  it("rejects unknown account ids without throwing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(runReleaseProofsCommand("/unused", ["capture", "unknown", "--yes"])).resolves.toBe(1);
    expect(error).toHaveBeenCalledWith(RELEASE_PROOFS_USAGE);

    error.mockRestore();
  });
});
