import { describe, expect, it } from "vitest";
import { localDocumentPath } from "./document-link.js";

const root = "/projects/Vanta";

describe("project document links", () => {
  it.each([
    ["vanta-ts/.artifacts/research.md", "vanta-ts/.artifacts/research.md"],
    ["./docs/report.md", "docs/report.md"],
    ["/projects/Vanta/docs/report.md", "docs/report.md"],
    ["file:///projects/Vanta/docs/report.md", "docs/report.md"],
    ["docs/Research%20%26%20notes.md", "docs/Research & notes.md"],
  ])("resolves %s within the current project", (href, expected) => {
    expect(localDocumentPath(href, root)).toBe(expected);
  });

  it.each([
    "https://example.com/report.md", "javascript:alert(1)", "data:text/html,test",
    "//example.com/report.md", "file://remote/projects/Vanta/report.md",
    "/projects/Vanta-other/report.md", "/private/report.md", "/projects/Vanta",
    "../private.md", "docs/../../private.md", "docs/%2e%2e/private.md",
    "file:///projects/Vanta/../private.md", "docs\\private.md", "docs/%00report.md",
    "docs/%2500report.md", "docs/report.md?fetch=1", "#section", "", "docs/%broken.md",
  ])("does not route unsafe or out-of-project target %s", (href) => {
    expect(localDocumentPath(href, root)).toBeNull();
  });

  it("does not guess a project when its root is unavailable", () => {
    expect(localDocumentPath("docs/report.md", "")).toBeNull();
  });
});
