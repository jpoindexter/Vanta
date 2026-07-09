import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listTickets } from "../tickets/store.js";
import { CHECKOUT_FIXTURE, filterUxFindings, runAdversarialUxPass } from "./adversarial.js";

describe("adversarial UX filter", () => {
  it("keeps actionable UX failures and drops persona venting", () => {
    const result = filterUxFindings(CHECKOUT_FIXTURE);
    expect(result.findings.map((f) => f.area)).toEqual(["pricing", "checkout"]);
    expect(result.ignored[0]?.reason).toContain("venting");
  });

  it("writes actionable findings as tickets with evidence comments", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-adversarial-ux-"));
    let n = 0;
    try {
      const result = await runAdversarialUxPass({
        dataDir: dir,
        observations: CHECKOUT_FIXTURE,
        deps: { now: () => new Date("2026-07-09T00:00:00.000Z"), id: () => `ux-${++n}` },
      });
      expect(result.tickets.map((t) => t.id)).toEqual(["ux-1", "ux-2"]);
      const tickets = await listTickets(dir);
      expect(tickets).toHaveLength(2);
      expect(tickets[0]?.labels).toEqual(expect.arrayContaining(["ux", "adversarial"]));
      expect(tickets[0]?.comments[0]?.text).toContain("Persona: hostile novice");
      expect(tickets[1]?.comments[0]?.text).toContain("nothing happened");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
