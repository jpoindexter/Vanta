import assert from "node:assert/strict";
import test from "node:test";

import { assessAudit } from "./dependency-audit.mjs";

const EXPECTED_ADVISORIES = [
  {
    source: 1,
    title: "ICNS parser denial of service",
    url: "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr",
  },
  {
    source: 2,
    title: "JXL and HEIF parser denial of service",
    url: "https://github.com/advisories/GHSA-5p2g-fcmc-qvqq",
  },
];

test("passes a clean dependency audit without an exception", () => {
  assert.deepEqual(assessAudit({ vulnerabilities: {} }), {
    advisoryIds: [],
    expandedPackages: 0,
    status: "pass",
  });
});

test("accepts only the two bounded image-size build-time advisories", () => {
  const audit = {
    vulnerabilities: {
      "image-size": { via: EXPECTED_ADVISORIES },
      "@docusaurus/mdx-loader": { via: ["image-size"] },
      "@docusaurus/core": { via: ["@docusaurus/mdx-loader", "@docusaurus/plugin-content-docs"] },
      "@docusaurus/plugin-content-docs": { via: ["@docusaurus/core"] },
    },
  };

  assert.deepEqual(assessAudit(audit, new Date("2026-09-30T23:59:59.999Z")), {
    advisoryIds: ["GHSA-5p2g-fcmc-qvqq", "GHSA-w3rx-r6r6-pgpr"],
    expandedPackages: 4,
    status: "bounded-exception",
  });
});

test("rejects the bounded image-size exception from its expiry boundary onward", () => {
  const audit = { vulnerabilities: { "image-size": { via: EXPECTED_ADVISORIES } } };
  for (const date of ["2026-10-01T00:00:00.000Z", "2026-10-28T00:00:00.000Z"]) {
    assert.throws(
      () => assessAudit(audit, new Date(date)),
      /The image-size risk acceptance expired on 2026-10-01/,
    );
  }
});

test("fails closed when npm reports any additional advisory", () => {
  const audit = {
    vulnerabilities: {
      "image-size": { via: EXPECTED_ADVISORIES },
      unexpected: {
        via: [{ source: 3, url: "https://github.com/advisories/GHSA-xxxx-yyyy-zzzz" }],
      },
    },
  };

  assert.throws(() => assessAudit(audit), /Unexpected dependency advisories/);
});

test("fails closed when npm cannot complete the audit", () => {
  assert.throws(
    () => assessAudit({ error: { summary: "registry unavailable" } }),
    /npm audit did not complete: registry unavailable/,
  );
});
