import { describe, it, expect } from "vitest";
import { fromAgentSkills, toAgentSkills } from "./agentskills-format.js";

// VANTA-SKILLS-HUB — agentskills.io interop.

const T = "2026-07-07T00:00:00.000Z";

// A representative THIRD-PARTY skill in the agentskills.io / Agent Skills open
// format: name + description + allowed-tools + license + body. It must load with
// no code change (the DONE clause).
const THIRD_PARTY = `---
name: PDF Filler
description: Fill and flatten PDF forms from a field map.
allowed-tools: Bash, Read, Write
license: MIT
version: 1.2.0
---
# PDF Filler

Use pdftk to fill \`form.pdf\` from a JSON field map, then flatten.`;

describe("fromAgentSkills", () => {
  it("loads a third-party skill without code changes (name/description/body)", () => {
    const s = fromAgentSkills(THIRD_PARTY, T);
    expect(s.meta.name).toBe("PDF Filler");
    expect(s.meta.description).toContain("Fill and flatten");
    expect(s.body).toContain("pdftk");
  });

  it("preserves allowed-tools (scalar or list) and license for round-trip", () => {
    const s = fromAgentSkills(THIRD_PARTY, T);
    expect(s.meta.allowedTools).toEqual(["Bash", "Read", "Write"]);
    expect(s.meta.license).toBe("MIT");
  });

  it("defaults created/updated to now (the format carries no timestamps)", () => {
    const s = fromAgentSkills(THIRD_PARTY, T);
    expect(s.meta.created).toBe(T);
    expect(s.meta.updated).toBe(T);
  });

  it("tolerates unknown fields (version) — they're simply dropped", () => {
    // No throw, and the skill still loads — proving forward-compat.
    expect(() => fromAgentSkills(THIRD_PARTY, T)).not.toThrow();
  });

  it("handles a scalar allowed-tools value", () => {
    const md = "---\nname: X\ndescription: d\nallowed-tools: Bash\n---\nbody";
    expect(fromAgentSkills(md, T).meta.allowedTools).toEqual(["Bash"]);
  });
});

describe("toAgentSkills", () => {
  it("emits only the portable fields (name/description/allowed-tools/license)", () => {
    const out = toAgentSkills(fromAgentSkills(THIRD_PARTY, T));
    expect(out).toContain("name: PDF Filler");
    expect(out).toContain("allowed-tools: [Bash, Read, Write]");
    expect(out).toContain("license: MIT");
    expect(out).not.toContain("created:"); // Vanta-internal, omitted
    expect(out).not.toContain("version:");
  });

  it("round-trips: import → export → import preserves the interop fields", () => {
    const once = fromAgentSkills(THIRD_PARTY, T);
    const twice = fromAgentSkills(toAgentSkills(once), T);
    expect(twice.meta.name).toBe(once.meta.name);
    expect(twice.meta.allowedTools).toEqual(once.meta.allowedTools);
    expect(twice.meta.license).toBe(once.meta.license);
    expect(twice.body).toBe(once.body);
  });

  it("omits allowed-tools/license when the skill has none (clean minimal output)", () => {
    const out = toAgentSkills({ meta: { name: "N", description: "d", created: T, updated: T, tags: [] }, body: "b" });
    expect(out).not.toContain("allowed-tools");
    expect(out).not.toContain("license");
  });
});
