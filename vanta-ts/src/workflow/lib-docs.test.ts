import { describe, expect, it } from "vitest";
import {
  detectLibraries,
  buildDocsFetchPlan,
  docsUrlFor,
  libDocsEnabled,
  formatDocsPlan,
  DOCS_URL_PATTERNS,
  type LibRef,
} from "./lib-docs.js";

describe("detectLibraries", () => {
  it("detects an ESM `import x from \"lib\"` specifier", () => {
    const libs = detectLibraries(`import { z } from "zod";`);
    expect(libs).toEqual([{ name: "zod", source: "import" }]);
  });

  it("detects a `require(\"lib\")` call", () => {
    const libs = detectLibraries(`const express = require("express");`);
    expect(libs).toEqual([{ name: "express", source: "import" }]);
  });

  it("detects a side-effect `import \"lib\"`", () => {
    const libs = detectLibraries(`import "tailwindcss/tailwind.css";`);
    expect(libs).toEqual([{ name: "tailwindcss", source: "import" }]);
  });

  it("detects a Python `from lib import x` form", () => {
    const libs = detectLibraries(`from pandas import DataFrame`);
    expect(libs).toEqual([{ name: "pandas", source: "import" }]);
  });

  it("excludes relative imports (./ and ../)", () => {
    const libs = detectLibraries(
      `import a from "./local.js";\nimport b from "../sibling.js";`,
    );
    expect(libs).toEqual([]);
  });

  it("excludes node builtins (plain and node: prefixed)", () => {
    const libs = detectLibraries(
      `import fs from "fs";\nimport { join } from "node:path";\nconst os = require("os");`,
    );
    expect(libs).toEqual([]);
  });

  it("keeps a scoped package whole", () => {
    const libs = detectLibraries(`import { z } from "@anthropic-ai/sdk";`);
    expect(libs).toEqual([{ name: "@anthropic-ai/sdk", source: "import" }]);
  });

  it("strips a subpath to the package root", () => {
    const libs = detectLibraries(`import fp from "lodash/fp";`);
    expect(libs).toEqual([{ name: "lodash", source: "import" }]);
  });

  it("strips a scoped-package subpath to @scope/pkg", () => {
    const libs = detectLibraries(`import x from "@scope/pkg/sub/deep.js";`);
    expect(libs).toEqual([{ name: "@scope/pkg", source: "import" }]);
  });

  it("dedupes repeated imports of the same lib", () => {
    const libs = detectLibraries(
      `import { a } from "react";\nimport { b } from "react";`,
    );
    expect(libs).toEqual([{ name: "react", source: "import" }]);
  });

  it("detects a bare mention of a known lib (no import)", () => {
    const libs = detectLibraries("Use zod for validation at the boundary.");
    expect(libs).toEqual([{ name: "zod", source: "mention" }]);
  });

  it("does not turn an arbitrary word into a library", () => {
    const libs = detectLibraries("Refactor the helper for clarity and speed.");
    expect(libs).toEqual([]);
  });

  it("prefers an import over a mention of the same lib", () => {
    const libs = detectLibraries(
      `Use react here.\nimport { useState } from "react";`,
    );
    expect(libs).toEqual([{ name: "react", source: "import" }]);
  });

  it("returns [] for text referencing no library", () => {
    expect(detectLibraries("just some prose with no code")).toEqual([]);
  });

  it("returns [] for empty / whitespace input", () => {
    expect(detectLibraries("")).toEqual([]);
    expect(detectLibraries("   \n  ")).toEqual([]);
  });
});

describe("docsUrlFor", () => {
  it("returns the known docs URL for a mapped lib", () => {
    expect(docsUrlFor("zod")).toBe(DOCS_URL_PATTERNS.zod);
    expect(docsUrlFor("vitest")).toBe(DOCS_URL_PATTERNS.vitest);
    expect(docsUrlFor("react")).toBe(DOCS_URL_PATTERNS.react);
  });

  it("falls back to the npm package page for an unknown lib", () => {
    expect(docsUrlFor("some-rare-pkg")).toBe(
      "https://www.npmjs.com/package/some-rare-pkg",
    );
  });

  it("preserves the scope slash but encodes each segment for an unknown scoped lib", () => {
    expect(docsUrlFor("@my-scope/util")).toBe(
      "https://www.npmjs.com/package/@my-scope/util",
    );
  });
});

describe("buildDocsFetchPlan", () => {
  it("maps a known lib to its docs URL", () => {
    const plan = buildDocsFetchPlan([{ name: "zod", source: "import" }]);
    expect(plan).toEqual([{ name: "zod", docsUrl: DOCS_URL_PATTERNS.zod }]);
  });

  it("maps an unknown lib to the npm fallback", () => {
    const plan = buildDocsFetchPlan([{ name: "obscure-lib", source: "import" }]);
    expect(plan).toEqual([
      { name: "obscure-lib", docsUrl: "https://www.npmjs.com/package/obscure-lib" },
    ]);
  });

  it("dedupes by name (first wins)", () => {
    const libs: LibRef[] = [
      { name: "zod", source: "import" },
      { name: "zod", source: "mention" },
    ];
    const plan = buildDocsFetchPlan(libs);
    expect(plan).toHaveLength(1);
    expect(plan[0]!.name).toBe("zod");
  });

  it("returns [] for no libraries (no fetch)", () => {
    expect(buildDocsFetchPlan([])).toEqual([]);
  });

  it("drops a name that fails the safe-package charset (no URL injection)", () => {
    const plan = buildDocsFetchPlan([
      { name: "evil/../../etc/passwd", source: "mention" },
      { name: "https://evil.test", source: "mention" },
    ]);
    expect(plan).toEqual([]);
  });
});

describe("libDocsEnabled", () => {
  it("is off by default (unset)", () => {
    expect(libDocsEnabled({})).toBe(false);
  });

  it("is on only when VANTA_LIB_DOCS=1", () => {
    expect(libDocsEnabled({ VANTA_LIB_DOCS: "1" })).toBe(true);
    expect(libDocsEnabled({ VANTA_LIB_DOCS: "0" })).toBe(false);
    expect(libDocsEnabled({ VANTA_LIB_DOCS: "true" })).toBe(false);
  });
});

describe("formatDocsPlan", () => {
  it("lists each lib with its URL", () => {
    const text = formatDocsPlan([
      { name: "zod", docsUrl: DOCS_URL_PATTERNS.zod! },
      { name: "react", docsUrl: DOCS_URL_PATTERNS.react! },
    ]);
    expect(text).toContain("Before coding: fetch current docs");
    expect(text).toContain("zod");
    expect(text).toContain(DOCS_URL_PATTERNS.zod!);
    expect(text).toContain("react");
    expect(text).toContain(DOCS_URL_PATTERNS.react!);
  });

  it("returns empty string for an empty plan (nothing to propose)", () => {
    expect(formatDocsPlan([])).toBe("");
  });
});

describe("end-to-end (detect → plan → format)", () => {
  it("turns a task with an import into a docs proposal", () => {
    const task = `Add a validated env loader.\nimport { z } from "zod";`;
    const plan = buildDocsFetchPlan(detectLibraries(task));
    expect(plan).toEqual([{ name: "zod", docsUrl: DOCS_URL_PATTERNS.zod }]);
    expect(formatDocsPlan(plan)).toContain(DOCS_URL_PATTERNS.zod!);
  });

  it("a task referencing no library yields no fetch and empty proposal text", () => {
    const task = "Rename the variable and tidy the comment.";
    const plan = buildDocsFetchPlan(detectLibraries(task));
    expect(plan).toEqual([]);
    expect(formatDocsPlan(plan)).toBe("");
  });
});
