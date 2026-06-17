// Dump the real tool registry + slash-command catalog as JSON for docs generation.
// Run: npx tsx scripts/dump-reference.ts > /tmp/vanta-reference.json
import { buildRegistry } from "../src/tools/index.js";
import { SLASH_COMMANDS } from "../src/repl/catalog.js";

const reg = buildRegistry();
const tools = reg.list().map((t) => ({
  name: t.schema.name,
  description: t.schema.description ?? "",
  parameters: t.schema.parameters ?? null,
  hasSafety: typeof t.describeForSafety === "function",
}));

const commands = SLASH_COMMANDS.map((c: { name: string; desc?: string }) => ({
  name: c.name,
  desc: c.desc ?? "",
}));

process.stdout.write(JSON.stringify({ tools, commands }, null, 2));
