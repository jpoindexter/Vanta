import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scan } from "./brand-scan.mjs";

function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "brand-scan-"));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

test("finds the old name in source, in any case, and the publisher's brand", () => {
  const found = scan(project({
    "apps/desktop/src/a.ts": "const hermesApi = 1;\n// Hermes agent\nconst NOUS_BLUE = 2;\n",
    "apps/desktop/src/b.tsx": "export const x = <p>Sign in with a Nous account</p>;\n",
  }));
  assert.equal(found["apps/desktop/src/a.ts"].length, 3);
  assert.equal(found["apps/desktop/src/b.tsx"].length, 1);
});

test("does not flag the French word, 'synchronous', or the allowed files", () => {
  const found = scan(project({
    "apps/desktop/src/i18n/fr.ts": "export const a = 'Nous avons ouvert le navigateur';\n",
    "apps/desktop/src/c.ts": "// runs synchronously and is synchronous-ish\n",
    "apps/desktop/src/lib/legacy-storage-migrate.ts": "const LEGACY = /^hermes/;\n",
    "apps/desktop/src/app/vanta/company/format.ts": "export const w = { hermes: 'Hermes' };\n",
  }));
  assert.deepEqual(found, {});
});
