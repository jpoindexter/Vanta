import { describe, it, expect } from "vitest";
import { sessionRows, skillRows, modelRows, PICKER_KINDS } from "./overlays.js";
import type { SessionMeta } from "../sessions/store.js";
import type { Skill } from "../skills/types.js";

describe("overlay row builders", () => {
  it("sessionRows carries a /resume command per session", () => {
    const ss: SessionMeta[] = [{ id: "20260613-1", turns: 3, title: "wiring" } as SessionMeta];
    const rows = sessionRows(ss);
    expect(rows[0]!.command).toBe("/resume 20260613-1");
    expect(rows[0]!.label).toContain("3 turn(s)");
    expect(rows[0]!.hint).toBe("wiring");
  });

  it("skillRows carries a /<name> command", () => {
    const sk = [{ meta: { name: "hill-climb", description: "iterate" } } as Skill];
    expect(skillRows(sk)[0]!.command).toBe("/hill-climb");
  });

  it("modelRows marks the current provider with ● and carries /model <id>", () => {
    const rows = modelRows("openai");
    const openai = rows.find((r) => r.command === "/model openai");
    expect(openai).toBeTruthy();
    expect(openai!.mark).toBe("●"); // current marker, its own column
    const other = rows.find((r) => r.command !== "/model openai");
    expect(other!.mark).toBeUndefined(); // non-current rows carry no mark
  });

  it("PICKER_KINDS maps bare commands to overlay kinds", () => {
    expect(PICKER_KINDS.model).toBe("model");
    expect(PICKER_KINDS.cockpit).toBe("cockpit");
    expect(PICKER_KINDS.nope).toBeUndefined();
  });
});
