import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listTickets } from "../tickets/store.js";
import { runAdversarialUxCommand } from "./adversarial-ux-cmd.js";

describe("adversarial UX command", () => {
  it("runs the checkout fixture and writes tickets", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-adversarial-ux-cmd-"));
    const lines: string[] = [];
    try {
      const code = await runAdversarialUxCommand(root, ["--fixture", "checkout"], { log: (line) => lines.push(line) });
      expect(code).toBe(0);
      expect(lines.join("\n")).toContain("created 2 ticket(s)");
      expect(await listTickets(join(root, ".vanta"))).toHaveLength(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses an injected URL reader for the live-app path", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-adversarial-ux-cmd-"));
    try {
      const code = await runAdversarialUxCommand(root, ["--url", "http://app.local"], {
        log: () => {},
        readUrl: async () => ({ ok: true, text: "checkout error" }),
      });
      expect(code).toBe(0);
      expect((await listTickets(join(root, ".vanta")))[0]?.title).toContain("visible failure state");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
