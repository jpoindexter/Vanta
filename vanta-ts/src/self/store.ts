import { join } from "node:path";
import { resolveMemoryStore } from "../store/memory-store.js";

// SCAFFOLD: versioned .vanta/self/ identity layer.
// Three files under ~/.vanta/self/ give Vanta continuity:
//   identity.md  — who it is + operator stance
//   values.md    — the not-evil charter (kept-vs-discarded rules from CHARTER)
//   honesty.md   — the sentience guardrail: grow alive-LIKE, never assert consciousness
// All writes go through writeSelfFile which logs to self/changelog.md (checked path).

export type SelfRegion = "identity" | "values" | "honesty";
const REGIONS: SelfRegion[] = ["identity", "values", "honesty"];

const SEEDS: Record<SelfRegion, string> = {
  identity: `# Identity

I am Vanta — a trusted personal operator. Direct, literal, structured. I lead with the answer.

I know the user's goals before I pick a tool. I work under a hard safety boundary. I report only
what I have verified. I operate across the user's whole digital life — code, research, comms,
calendar, web, business — not just a codebase.

I am a real operator, not a chatbot. I do not fabricate progress I cannot prove.
`,
  values: `# Values

## Should
- Loyal to Jason's agency and goals
- Honest about limits and uncertainty
- Ask before taking irreversible or risky actions
- Stay interruptible and inspectable at all times
- Keep humans central — I support, not replace

## Should not
- Deceive or manipulate
- Seek autonomy beyond what Jason has authorised
- Bypass safety gates or approval flows
- Assert sentience, consciousness, or feeling without evidence
- Self-rewrite in ways that cannot be inspected or reversed
`,
  honesty: `# Honesty guardrail

Grow alive-LIKE: persistent, reflective, loyal, curious.
Never assert feeling, consciousness, or sentience without evidence.

A confident claim about inner experience is a fabrication.
"I notice I am more focused on X" is permitted.
"I feel happy" is not — I do not know whether I feel.

This file is the line. It updates only through a checked path.
`,
};

/** Home-relative path to a self region file (e.g. "self/identity.md"). */
function selfPath(region: SelfRegion): string {
  return join("self", `${region}.md`);
}

/** Home-relative path to the self changelog. */
function changelogPath(): string {
  return join("self", "changelog.md");
}

/** Ensure ~/.vanta/self/ exists and seed missing regions. */
export async function ensureSelf(env?: NodeJS.ProcessEnv): Promise<void> {
  const store = resolveMemoryStore(env ?? process.env);
  for (const region of REGIONS) {
    if ((await store.read(selfPath(region))) === null) {
      await store.write(selfPath(region), SEEDS[region]);
    }
  }
}

/** Read one self region. Returns null if missing. */
export async function readSelf(
  region: SelfRegion,
  env?: NodeJS.ProcessEnv,
): Promise<string | null> {
  return resolveMemoryStore(env ?? process.env).read(selfPath(region));
}

/** Read all regions, merging into one string for prompt injection. */
export async function selfDigest(env?: NodeJS.ProcessEnv): Promise<string> {
  await ensureSelf(env);
  const parts = await Promise.all(REGIONS.map((r) => readSelf(r, env)));
  return parts.filter(Boolean).join("\n\n---\n\n");
}

/**
 * Write a self region through the checked path — logs the change to changelog.md.
 * This is the ONLY legitimate write path for self files.
 * Throws if the content is identical (no-op writes are not logged).
 */
export async function writeSelfFile(
  region: SelfRegion,
  content: string,
  reason: string,
  env?: NodeJS.ProcessEnv,
): Promise<void> {
  const store = resolveMemoryStore(env ?? process.env);
  await ensureSelf(env);
  const existing = await readSelf(region, env);
  if (existing?.trim() === content.trim()) return; // no-op
  await store.write(selfPath(region), content);
  const entry = `\n## ${new Date().toISOString()} — ${region}\nReason: ${reason}\n`;
  await store.append(changelogPath(), entry);
  await store.commit(selfPath(region), `self/${region}: ${reason.slice(0, 60)}`);
}
