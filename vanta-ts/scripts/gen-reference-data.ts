// Dumps the LIVE tool registry + slash-command catalog to the website's
// reference-data.json (the snapshot vanta-website/scripts/gen-reference.mjs turns
// into docs/reference/{tools,commands}-list.md). Lives INSIDE vanta-ts so tsx
// resolves the tool dep graph against vanta-ts's package context (running it from
// vanta-website fails on deps with no "exports" main, e.g. winnow).
//   cd vanta-ts && ./node_modules/.bin/tsx scripts/gen-reference-data.ts
//   node ../vanta-website/scripts/gen-reference.mjs
// Sorted by name so regenerated diffs stay clean. Source of truth for "docs match code".
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildRegistry } from "../src/tools/index.js";
import { SLASH_COMMANDS } from "../src/repl/catalog.js";

async function main() {
  const reg = buildRegistry();
  const tools = reg
    .list()
    .map((t) => ({
      name: t.schema.name,
      description: t.schema.description,
      parameters: t.schema.parameters,
      hasSafety: typeof t.describeForSafety === "function",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const commands = SLASH_COMMANDS.map((c) => ({ name: c.name, desc: c.desc })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const here = dirname(fileURLToPath(import.meta.url));
  const out = join(here, "..", "..", "vanta-website", "scripts", "reference-data.json");
  writeFileSync(out, JSON.stringify({ tools, commands }, null, 2) + "\n");
  console.log(`reference-data.json → ${tools.length} tools, ${commands.length} commands`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
