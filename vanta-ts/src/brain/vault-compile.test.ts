import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileVault } from "./vault-compile.js";

describe("vault compile pipeline", () => {
  it("emits a review diff, writes entity/concept pages plus INDEX, and leaves raw files separate", async () => {
    const root = join(tmpdir(), `vanta-vault-compile-${Date.now()}`);
    const raw = join(root, "raw");
    const vault = join(root, "vault");
    await mkdir(raw, { recursive: true });
    await mkdir(vault, { recursive: true });
    await writeFile(join(raw, "meeting.md"), [
      "# Kernel Approval",
      "Jason Poindexter said Vanta should keep raw transcripts separate.",
      'The phrase "trusted operator" should become a concept.',
      "",
    ].join("\n"));
    try {
      const review = await compileVault(raw, vault);
      expect(review.changed).toContain(join("wiki", "INDEX.md"));
      expect(review.diff).toContain("+++ wiki/INDEX.md (compiled)");
      expect(existsSync(join(vault, "wiki", "INDEX.md"))).toBe(false);

      const applied = await compileVault(raw, vault, { apply: true });
      expect(applied.rawFiles).toEqual(["meeting.md"]);
      const index = await readFile(join(vault, "wiki", "INDEX.md"), "utf8");
      expect(index).toContain("raw/meeting.md");
      expect(index).toContain("wiki/entities/jason-poindexter.md");
      expect(await readFile(join(vault, "wiki", "entities", "jason-poindexter.md"), "utf8")).toContain("[[raw/meeting.md#L2|meeting.md:L2]]");
      expect(await readFile(join(vault, "wiki", "concepts", "trusted-operator.md"), "utf8")).toContain("# trusted operator");
      expect(existsSync(join(vault, "raw", "meeting.md"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
