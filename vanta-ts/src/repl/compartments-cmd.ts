import { existsSync } from "node:fs";
import { join } from "node:path";
import { classifyPath, compartmentMap } from "../self/compartments.js";
import { detectBroken, lastKnownGood, readMarkers } from "../self/detect.js";
import type { CompartmentHealth, CapCheck } from "../self/detect.js";
import type { Compartment, CompartmentInfo } from "../self/compartments.js";
import { proposeRollback, formatRollbackProposal, isCompartment } from "../self/rollback.js";
import { resolveVantaHome } from "../store/home.js";
import { gatherStatus } from "../status.js";
import type { SlashHandler } from "./types.js";

const NO_SELF_EDIT_NOTE = "(brainstem + skeleton are never self-edited — kernel-enforced)";

const VERDICT_GLYPH: Record<CompartmentHealth["verdict"], string> = {
  healthy: "✓",
  impaired: "~",
  down: "✗",
};

// ---------------------------------------------------------------------------
// Real capability checks — cheap, no side effects, tagged by compartment
// ---------------------------------------------------------------------------

/** Sync filesystem checks (no I/O beyond existsSync). Pure given env. */
function fsChecks(env: NodeJS.ProcessEnv): CapCheck[] {
  const home = resolveVantaHome(env);
  const repoRoot = env.VANTA_ROOT ?? process.cwd();
  const storeOk = existsSync(home);
  const skillsOk = existsSync(join(home, "skills"));
  const factoryOk = existsSync(join(repoRoot, "vanta-ts", "src", "factory"));
  return [
    { name: "store",       compartment: "memory",   ok: storeOk,   detail: storeOk   ? home      : "~/.vanta missing"   },
    { name: "skills-dir",  compartment: "limbs",    ok: skillsOk,  detail: skillsOk  ? "present" : "skills/ missing"     },
    { name: "factory-dir", compartment: "skeleton", ok: factoryOk, detail: factoryOk ? "present" : "factory/ missing"    },
  ];
}

/** Async network/provider checks. */
async function networkChecks(env: NodeJS.ProcessEnv): Promise<CapCheck[]> {
  const out: CapCheck[] = [];
  try {
    const st = await gatherStatus(env);
    out.push({ name: "kernel",   compartment: "brainstem", ok: st.kernel.up,   detail: st.kernel.up   ? "up"           : "down"                        });
    out.push({ name: "provider", compartment: "reflexes",  ok: st.provider.ok, detail: st.provider.ok ? st.provider.id : (st.provider.error ?? "unresolved") });
  } catch {
    out.push({ name: "kernel",   compartment: "brainstem", ok: false, detail: "unreachable" });
    out.push({ name: "provider", compartment: "reflexes",  ok: false, detail: "check failed" });
  }
  return out;
}

async function buildChecks(env: NodeJS.ProcessEnv): Promise<CapCheck[]> {
  const [net, fs] = await Promise.all([networkChecks(env), Promise.resolve(fsChecks(env))]);
  return [...net, ...fs];
}

// ---------------------------------------------------------------------------
// Formatters — pure after data is gathered
// ---------------------------------------------------------------------------

/** Pure: render the full compartment map as a titled list. */
export function formatCompartments(map: ReturnType<typeof compartmentMap>): string {
  const rows = map.map(
    (c) => `  ${c.compartment.padEnd(12)} · ${c.maxAutonomy.padEnd(6)} · ${c.scope}`,
  );
  return [`Compartment map — ${map.length} compartments`, ...rows, "", NO_SELF_EDIT_NOTE].join("\n");
}

/** Pure: render the health overlay. */
export function formatCompartmentHealth(
  map: ReturnType<typeof compartmentMap>,
  healthMap: Map<Compartment, CompartmentHealth>,
  lkg: Partial<Record<Compartment, string>>,
): string {
  const lines: string[] = [`Compartment health — ${map.length} compartments`, ""];
  for (const entry of map) {
    const c = entry.compartment;
    const h = healthMap.get(c);
    const verdict = h?.verdict ?? "healthy";
    const glyph = VERDICT_GLYPH[verdict];
    const sha = lkg[c];
    const lkgStr = sha ? `  lkg: ${sha.slice(0, 8)}` : "";
    const failingChecks = h?.checks.filter((ch) => !ch.ok) ?? [];
    const failStr =
      failingChecks.length > 0 ? `  [${failingChecks.map((ch) => ch.name).join(", ")}]` : "";
    lines.push(
      `  ${glyph} ${c.padEnd(12)} · ${entry.maxAutonomy.padEnd(6)} · ${verdict}${lkgStr}${failStr}`,
    );
  }
  lines.push("", NO_SELF_EDIT_NOTE);
  return lines.join("\n");
}

function describe(info: CompartmentInfo, path: string): string {
  return [
    `${path}`,
    `  compartment : ${info.compartment}`,
    `  maxAutonomy : ${info.maxAutonomy}`,
    `  why         : ${info.why}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const compartments: SlashHandler = async (arg, ctx) => {
  const trimmed = arg.trim();

  // /compartments rollback <compartment>
  if (trimmed.startsWith("rollback")) {
    const part = trimmed.replace(/^rollback\s*/, "").trim();
    if (!part) {
      return { output: "Usage: /compartments rollback <compartment>\nCompartments: brainstem skeleton reflexes limbs memory" };
    }
    if (!isCompartment(part)) {
      return { output: `Unknown compartment: '${part}'\nKnown: brainstem, skeleton, reflexes, limbs, memory` };
    }
    const env = ctx?.env ?? process.env;
    const markers = await readMarkers(env);
    const proposal = proposeRollback(part, markers);
    return { output: formatRollbackProposal(proposal) };
  }

  // classify a path (bare non-subcommand arg)
  if (trimmed) {
    return { output: describe(classifyPath(trimmed), trimmed) };
  }

  const map = compartmentMap();

  // derive health from real checks
  const env = ctx?.env ?? process.env;
  const [checks, markers] = await Promise.all([buildChecks(env), readMarkers(env)]);

  const healthList = detectBroken(checks);
  const healthMap = new Map<Compartment, CompartmentHealth>(
    healthList.map((h) => [h.compartment, h]),
  );
  const lkg = lastKnownGood(markers);

  return { output: formatCompartmentHealth(map, healthMap, lkg) };
};
