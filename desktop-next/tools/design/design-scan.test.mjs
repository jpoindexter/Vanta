import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scan } from "./design-scan.mjs";

function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "design-scan-"));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

test("counts a hex colour, a literal radius, an arbitrary colour and an off-scale text size", () => {
  const root = project({
    "app/Card.tsx": 'export const x = <div className="rounded-[8px] bg-[#fff] text-[13px]" style={{ color: "#112233" }} />',
    "app/card.css": ".a { border-radius: 12px; color: #abc; } .b { border-radius: var(--radius-lg); }",
  });
  const found = scan(root);

  assert.deepEqual(found["literal-radius"], { "app/Card.tsx": 1, "app/card.css": 1 });
  assert.deepEqual(found["hex-color"], { "app/Card.tsx": 2, "app/card.css": 1 });
  assert.deepEqual(found["arbitrary-color"], { "app/Card.tsx": 1 });
  assert.deepEqual(found["arbitrary-text-size"], { "app/Card.tsx": 1 });
});

test("a radius that already names a step, a role or a circle is not a violation", () => {
  const root = project({
    "a.tsx": 'export const x = <div className="rounded-lg rounded-control rounded-surface rounded-full rounded-[inherit]" />',
    "a.css": ".a { border-radius: 50%; border-radius: 0; border-radius: inherit; border-radius: var(--radius-pill); }",
  });

  assert.deepEqual(scan(root)["literal-radius"], {});
});

test("the theme seeds, the token file and tests are where literals are allowed", () => {
  const root = project({
    "themes/presets.ts": "export const c = '#7c3aed'",
    "styles.css": ":root { --x: #fff; border-radius: 4px }",
    "a.test.tsx": 'const x = "#fff"',
  });

  assert.deepEqual(scan(root)["hex-color"], {});
});
