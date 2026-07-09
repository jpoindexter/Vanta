import { describe, expect, it, vi } from "vitest";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runResearchReceiptsCommand } from "./research-receipts-cmd.js";

describe("runResearchReceiptsCommand", () => {
  it("prints a skeptic report and writes surviving claims to vault when applied", async () => {
    const root = join(tmpdir(), `vanta-receipts-cli-${Date.now()}`);
    const claims = join(root, "claims.json");
    const vault = join(root, "vault");
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((line = "") => { logs.push(String(line)); });
    await mkdir(root, { recursive: true });
    await writeFile(claims, JSON.stringify({
      objective: "cli receipts",
      claims: [
        { claim: "Measured result survives", source: "https://example.com/good", date: "2026-07-01", expiry: "2099-08-01" },
        { claim: "No source fails", date: "2026-07-01", expiry: "2099-08-01" },
      ],
    }));
    try {
      const code = await runResearchReceiptsCommand([claims, "--vault", vault, "--apply"]);
      expect(code).toBe(0);
      expect(logs.join("\n")).toContain("survivors: 1/2");
      expect(await readFile(join(vault, "wiki", "research", "cli-receipts.md"), "utf8")).toContain("Measured result survives");
    } finally {
      spy.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });
});
