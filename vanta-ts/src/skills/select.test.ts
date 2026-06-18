import { describe, it, expect } from "vitest";
import { selectSkillsForTask } from "./select.js";
import type { SkillIndexEntry } from "../prompt.js";

const entries: SkillIndexEntry[] = [
  { name: "deploy-checklist", description: "pre-deploy checks, migrations, rollback" },
  { name: "security-scan", description: "OWASP, CVEs, secrets, injection" },
  { name: "changelog-generator", description: "turn commits into release notes" },
  { name: "react-expert", description: "react performance and best practices" },
  { name: "db-design", description: "schema design, indexes, migrations" },
];

describe("selectSkillsForTask", () => {
  it("returns the full index unchanged for the interactive placeholder or empty task", () => {
    expect(selectSkillsForTask(entries, "interactive session", 2)).toBe(entries);
    expect(selectSkillsForTask(entries, "   ", 2)).toBe(entries);
  });

  it("returns the full index unchanged when it's already within max", () => {
    expect(selectSkillsForTask(entries, "deploy", 10)).toBe(entries);
  });

  it("keeps only the top-k skills relevant to the task", () => {
    const out = selectSkillsForTask(entries, "run the security scan for injection and secrets", 2);
    expect(out.length).toBeLessThanOrEqual(2);
    expect(out[0]!.name).toBe("security-scan");
    expect(out.some((s) => s.name === "react-expert")).toBe(false); // irrelevant dropped
  });

  it("ranks the most relevant skill first", () => {
    const out = selectSkillsForTask(entries, "design a database schema with migrations and indexes", 3);
    expect(out[0]!.name).toBe("db-design");
  });

  it("returns none when no skill is relevant (recall still serves the full library)", () => {
    expect(selectSkillsForTask(entries, "xyzzy quux flibbertigibbet", 3)).toEqual([]);
  });
});
