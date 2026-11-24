// Rewrites the guard's baseline from what the code contains now. Run after a migration lowers the counts,
// so the lower number becomes the new ceiling. The guard test never rewrites it; it only fails when a count rises.
//
//   node tools/design/guard-baseline.mjs
import fs from "node:fs";
import path from "node:path";

import { scan, SRC, total } from "./design-scan.mjs";

const file = path.join(SRC, "styles", "design-guard.baseline.json");
const next = scan();
fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
for (const [name, perFile] of Object.entries(next)) console.log(`${name}: ${total(perFile)} in ${Object.keys(perFile).length} file(s)`);
console.log(`wrote ${path.relative(process.cwd(), file)}`);
