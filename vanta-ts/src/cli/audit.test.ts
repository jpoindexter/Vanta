import { describe, it, expect } from "vitest";
import { formatAuditReport, parseNpmAuditJson, parseCargoAuditJson } from "./audit.js";
import type { AuditResult } from "./audit.js";

const clean: AuditResult = { ok: true, critical: 0, high: 0, moderate: 0, low: 0, advisories: [] };

describe("formatAuditReport", () => {
  it("shows 'no issues' for both when clean", () => {
    const out = formatAuditReport(clean, clean);
    expect(out).toContain("npm: no issues");
    expect(out).toContain("cargo: no issues");
    expect(out).toContain("Result: clean");
  });

  it("shows severity counts when there are high vulns", () => {
    const npm: AuditResult = { ok: false, critical: 1, high: 2, moderate: 0, low: 3, advisories: [] };
    const out = formatAuditReport(npm, clean);
    expect(out).toContain("1 critical");
    expect(out).toContain("2 high");
    expect(out).toContain("3 low");
    expect(out).toContain("Result: vulnerabilities found");
  });

  it("shows advisory text when present", () => {
    const npm: AuditResult = {
      ok: false, critical: 0, high: 1, moderate: 0, low: 0,
      advisories: ["lodash: Prototype Pollution", "express: ReDoS"],
    };
    const out = formatAuditReport(npm, clean);
    expect(out).toContain("lodash: Prototype Pollution");
    expect(out).toContain("express: ReDoS");
  });

  it("reports cargo vulns separately", () => {
    const cargo: AuditResult = { ok: false, critical: 0, high: 1, moderate: 0, low: 0, advisories: ["openssl: CVE-2023-1234"] };
    const out = formatAuditReport(clean, cargo);
    expect(out).toContain("cargo: 1 high");
    expect(out).toContain("openssl: CVE-2023-1234");
    expect(out).toContain("Result: vulnerabilities found");
  });
});

describe("parseNpmAuditJson", () => {
  it("parses a clean audit (zero counts)", () => {
    const raw = JSON.stringify({
      metadata: { vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0 } },
      vulnerabilities: {},
    });
    const r = parseNpmAuditJson(raw);
    expect(r.ok).toBe(true);
    expect(r.critical).toBe(0);
  });

  it("parses counts and advisory titles from vulns map", () => {
    const raw = JSON.stringify({
      metadata: { vulnerabilities: { critical: 1, high: 0, moderate: 0, low: 0 } },
      vulnerabilities: {
        "bad-pkg": {
          name: "bad-pkg",
          severity: "critical",
          via: [{ title: "Remote code execution", severity: "critical" }],
        },
      },
    });
    const r = parseNpmAuditJson(raw);
    expect(r.ok).toBe(false);
    expect(r.critical).toBe(1);
    expect(r.advisories[0]).toContain("bad-pkg");
    expect(r.advisories[0]).toContain("Remote code execution");
  });

  it("returns ok:false with advisory on invalid JSON", () => {
    const r = parseNpmAuditJson("not json");
    expect(r.ok).toBe(false);
    expect(r.advisories[0]).toContain("invalid JSON");
  });
});

describe("parseCargoAuditJson", () => {
  it("returns clean for empty vulnerability list", () => {
    const raw = JSON.stringify({ vulnerabilities: { list: [] } });
    const r = parseCargoAuditJson(raw);
    expect(r.ok).toBe(true);
    expect(r.high).toBe(0);
  });

  it("parses vulnerability entries", () => {
    const raw = JSON.stringify({
      vulnerabilities: {
        list: [
          { advisory: { package: "openssl", title: "Use after free" } },
          { advisory: { package: "regex", title: "ReDoS" } },
        ],
      },
    });
    const r = parseCargoAuditJson(raw);
    expect(r.ok).toBe(false);
    expect(r.high).toBe(2);
    expect(r.advisories).toContain("openssl: Use after free");
    expect(r.advisories).toContain("regex: ReDoS");
  });
});
