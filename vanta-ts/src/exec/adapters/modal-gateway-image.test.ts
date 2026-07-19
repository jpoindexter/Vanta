import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../../../..");

describe("Modal gateway image context", () => {
  it("packages the roadmap snapshot without adding Git metadata", async () => {
    const [dockerfile, adapter] = await Promise.all([
      readFile(resolve(repoRoot, "Dockerfile.modal-gateway"), "utf8"),
      readFile(resolve(repoRoot, "vanta-ts/src/exec/adapters/modal-gateway.py"), "utf8"),
    ]);

    expect(dockerfile).toContain("COPY roadmap.json ./roadmap.json");
    expect(dockerfile).not.toContain("COPY .git");
    expect(adapter).toContain('"roadmap.json"');
  });
});
