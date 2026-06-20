import { describe, it, expect } from "vitest";
import {
  DEFAULT_AGENT_NAME,
  DEFAULT_AGENT_COLOR,
  DEFAULT_IDENTITY,
  resolveAgentIdentity,
  isCustomIdentity,
  formatAgentIdentity,
  sanitizeAgentName,
  isValidInkColor,
} from "./agent-identity.js";
import { teammateColor } from "./teammate-color.js";

/** A clean env with the identity vars unset (and nothing else relevant). */
const emptyEnv: NodeJS.ProcessEnv = {};

describe("sanitizeAgentName", () => {
  it("strips ANSI escape sequences from the name", () => {
    expect(sanitizeAgentName("\x1b[31mAtlas\x1b[0m")).toBe("Atlas");
  });

  it("replaces control characters (tab/newline/null) with collapsed spaces", () => {
    expect(sanitizeAgentName("At\tlas\nx\x00y")).toBe("At las x y");
  });

  it("collapses internal whitespace and trims", () => {
    expect(sanitizeAgentName("   Atlas   Prime   ")).toBe("Atlas Prime");
  });

  it("caps the name length at ~24 chars", () => {
    const long = "A".repeat(40);
    expect(sanitizeAgentName(long)).toHaveLength(24);
  });

  it("returns empty for a name that is only control/whitespace", () => {
    expect(sanitizeAgentName("\x1b[2J\t\n  ")).toBe("");
  });
});

describe("isValidInkColor", () => {
  it("accepts named ANSI colors (case-insensitive) and bright variants", () => {
    expect(isValidInkColor("cyan")).toBe(true);
    expect(isValidInkColor("CYAN")).toBe(true);
    expect(isValidInkColor("greenBright")).toBe(true);
  });

  it("accepts hex colors", () => {
    expect(isValidInkColor("#6bdcff")).toBe(true);
    expect(isValidInkColor("#abc")).toBe(true);
  });

  it("accepts rgb()/hsl()/ansi forms", () => {
    expect(isValidInkColor("rgb(255, 184, 107)")).toBe(true);
    expect(isValidInkColor("hsl(200, 50%, 50%)")).toBe(true);
    expect(isValidInkColor("ansi256")).toBe(true);
  });

  it("rejects garbage, empty, and out-of-form values", () => {
    expect(isValidInkColor("")).toBe(false);
    expect(isValidInkColor("notacolor")).toBe(false);
    expect(isValidInkColor("#xyz")).toBe(false);
    expect(isValidInkColor("rgb(1,2)")).toBe(false);
  });
});

describe("resolveAgentIdentity — name precedence (env > settings > default)", () => {
  it("uses VANTA_AGENT_NAME over the settings name", () => {
    const id = resolveAgentIdentity({ VANTA_AGENT_NAME: "Atlas" }, "Mercury");
    expect(id.name).toBe("Atlas");
  });

  it("falls back to the settings name when env is unset", () => {
    const id = resolveAgentIdentity(emptyEnv, "Mercury");
    expect(id.name).toBe("Mercury");
  });

  it("falls back to the settings name when env name sanitizes to empty", () => {
    const id = resolveAgentIdentity({ VANTA_AGENT_NAME: "\x1b[0m\t" }, "Mercury");
    expect(id.name).toBe("Mercury");
  });

  it("falls back to the default when nothing is set", () => {
    const id = resolveAgentIdentity(emptyEnv);
    expect(id.name).toBe(DEFAULT_AGENT_NAME);
  });

  it("sanitizes the resolved name", () => {
    const id = resolveAgentIdentity({ VANTA_AGENT_NAME: "  \x1b[31mAtlas\x1b[0m  " });
    expect(id.name).toBe("Atlas");
  });
});

describe("resolveAgentIdentity — color precedence (env > name-derived > default)", () => {
  it("uses a valid VANTA_AGENT_COLOR over everything", () => {
    const id = resolveAgentIdentity({ VANTA_AGENT_NAME: "Atlas", VANTA_AGENT_COLOR: "magenta" });
    expect(id.color).toBe("magenta");
  });

  it("derives a stable color from a custom name when no color is set", () => {
    const id = resolveAgentIdentity({ VANTA_AGENT_NAME: "Atlas" });
    expect(id.color).toBe(teammateColor("Atlas"));
  });

  it("derives the SAME color for the same custom name (stable)", () => {
    const a = resolveAgentIdentity({ VANTA_AGENT_NAME: "Atlas" });
    const b = resolveAgentIdentity({ VANTA_AGENT_NAME: "Atlas" });
    expect(a.color).toBe(b.color);
  });

  it("falls back to a bad env color → the name-derived color (never invalid)", () => {
    const id = resolveAgentIdentity({ VANTA_AGENT_NAME: "Atlas", VANTA_AGENT_COLOR: "notacolor" });
    expect(id.color).toBe(teammateColor("Atlas"));
    expect(isValidInkColor(id.color)).toBe(true);
  });

  it("uses the default color for the default name (no custom name)", () => {
    const id = resolveAgentIdentity(emptyEnv);
    expect(id.color).toBe(DEFAULT_AGENT_COLOR);
  });

  it("a bad env color with the default name → the default color", () => {
    const id = resolveAgentIdentity({ VANTA_AGENT_COLOR: "notacolor" });
    expect(id.color).toBe(DEFAULT_AGENT_COLOR);
    expect(isValidInkColor(id.color)).toBe(true);
  });

  it("a valid env color with no custom name still applies (color-only identity)", () => {
    const id = resolveAgentIdentity({ VANTA_AGENT_COLOR: "cyan" });
    expect(id.name).toBe(DEFAULT_AGENT_NAME);
    expect(id.color).toBe("cyan");
  });
});

describe("isCustomIdentity", () => {
  it("is false for the default identity (unset = current behavior)", () => {
    expect(isCustomIdentity(resolveAgentIdentity(emptyEnv))).toBe(false);
    expect(isCustomIdentity(DEFAULT_IDENTITY)).toBe(false);
  });

  it("is true when the name is customized", () => {
    expect(isCustomIdentity(resolveAgentIdentity({ VANTA_AGENT_NAME: "Atlas" }))).toBe(true);
  });

  it("is true when only the color is customized", () => {
    expect(isCustomIdentity(resolveAgentIdentity({ VANTA_AGENT_COLOR: "cyan" }))).toBe(true);
  });
});

describe("formatAgentIdentity", () => {
  it("returns the name as the compact label", () => {
    expect(formatAgentIdentity(DEFAULT_IDENTITY)).toBe("Vanta");
    expect(formatAgentIdentity(resolveAgentIdentity({ VANTA_AGENT_NAME: "Atlas" }))).toBe("Atlas");
  });
});

describe("unset = default identity (current behavior)", () => {
  it("returns the default identity for a completely empty env", () => {
    const id = resolveAgentIdentity(emptyEnv);
    expect(id).toEqual(DEFAULT_IDENTITY);
  });
});
