import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { listBlueprints, getBlueprint } from "../blueprint/store.js";
import { resolveVars, parseVarArgs, planBlueprint, type PlannedFile } from "../blueprint/apply.js";

// VANTA-BLUEPRINTS CLI — `vanta blueprint list` and `vanta blueprint <name>
// [--var k=v ...] [--out <dir>]`. The plan is pure (apply.ts); this writes it,
// refusing to overwrite existing files unless --force.

async function exists(p: string): Promise<boolean> {
  return access(p).then(() => true, () => false);
}

/** Print the available blueprints (bundled + user). */
async function runList(): Promise<void> {
  const bps = await listBlueprints();
  if (bps.length === 0) { console.log("No blueprints. Add one under ~/.vanta/blueprints/<name>/blueprint.json"); return; }
  console.log("Blueprints:");
  for (const bp of bps) {
    const vars = bp.vars.map((v) => (v.default === undefined ? v.key : `${v.key}=${v.default}`)).join(", ");
    console.log(`  ${bp.name.padEnd(16)} ${bp.description}${vars ? `  [vars: ${vars}]` : ""}`);
  }
}

/** Write the planned files, refusing existing ones unless force. Returns written paths. */
async function writePlan(plan: PlannedFile[], force: boolean): Promise<string[]> {
  const collisions = force ? [] : await Promise.all(plan.map((f) => exists(f.path))).then((xs) => plan.filter((_, i) => xs[i]));
  if (collisions.length) {
    console.error(`vanta blueprint: ${collisions.length} file(s) already exist (use --force to overwrite):`);
    for (const c of collisions) console.error(`  ${c.path}`);
    process.exit(1);
  }
  const written: string[] = [];
  for (const f of plan) {
    await mkdir(dirname(f.path), { recursive: true });
    await writeFile(f.path, f.content, "utf8");
    written.push(f.path);
  }
  return written;
}

export async function runBlueprintCommand(repoRoot: string, rest: string[]): Promise<void> {
  const name = rest[0];
  if (!name || name === "list") return runList();
  const bp = await getBlueprint(name);
  if (!bp) { console.error(`vanta blueprint: no blueprint "${name}" (see \`vanta blueprint list\`)`); process.exit(1); }

  const outIdx = rest.indexOf("--out");
  const outValue = outIdx >= 0 ? rest[outIdx + 1] : undefined;
  const targetDir = resolve(repoRoot, outValue ?? ".");
  // Vars are the bare `k=v` args (not the name, flags, or the --out value).
  const provided = parseVarArgs(rest.slice(1).filter((a) => !a.startsWith("--") && a !== outValue && a.includes("=")));

  const resolved = resolveVars(bp, provided);
  if ("missing" in resolved) {
    console.error(`vanta blueprint ${name}: missing required var(s): ${resolved.missing.join(", ")} — pass k=v`);
    process.exit(1);
  }
  const written = await writePlan(planBlueprint(bp, resolved.values, targetDir), rest.includes("--force"));
  console.log(`Scaffolded "${bp.name}" → ${written.length} file(s):`);
  for (const w of written) console.log(`  ${w}`);
}
