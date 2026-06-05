// B-v2: Emergent self-designed brain substrate.
// This module is the bootstrap scaffold — the v1.4 .md brain is the seed.
// When ARGO_BRAIN_V2=1, Argo can read/write this module to design its own
// brain representation (its own format, its own code). The kernel's
// is_protected_path does NOT protect this file — the agent can evolve it.
//
// Design intent:
// - v1.4 .md brain = human-readable seed (safety: humans can audit)
// - v2 brain = whatever Argo designs, constrained only by:
//     (a) must produce a string digest for prompt injection
//     (b) must round-trip to disk (read = recall; write = update)
//     (c) kernel still gates every write through assess()
//
// The agent develops v2 by: (1) reflecting on what the .md brain lacks,
// (2) writing code here to fill the gap, (3) running it. No human ceremony.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveArgoHome } from "../store/home.js";

/** The self-designed brain spec — Argo writes this. Initially a stub. */
export type BrainV2Spec = {
  version: number;
  description: string;
  substrate: "jsonl" | "sqlite" | "graph" | "vector" | "custom";
  digest: (env: NodeJS.ProcessEnv) => Promise<string>;
  read: (key: string, env: NodeJS.ProcessEnv) => Promise<string | null>;
  write: (key: string, value: string, env: NodeJS.ProcessEnv) => Promise<void>;
};

const SPEC_FILE = "brain-v2-spec.json";

/** Bootstrap spec — a JSON key-value store. Argo replaces this. */
const BOOTSTRAP_SPEC: BrainV2Spec = {
  version: 1,
  description: "Bootstrap v2 brain — simple JSON key-value. Argo evolves this.",
  substrate: "jsonl",
  async digest(env) {
    const file = join(resolveArgoHome(env), "brain-v2.json");
    try {
      const raw: Record<string, string> = JSON.parse(await readFile(file, "utf8"));
      const entries = Object.entries(raw).slice(0, 10);
      return `### Brain v2 (${entries.length} entries)\n` + entries.map(([k, v]) => `- ${k}: ${v.slice(0, 100)}`).join("\n");
    } catch { return ""; }
  },
  async read(key, env) {
    const file = join(resolveArgoHome(env), "brain-v2.json");
    try {
      const raw: Record<string, string> = JSON.parse(await readFile(file, "utf8"));
      return raw[key] ?? null;
    } catch { return null; }
  },
  async write(key, value, env) {
    const file = join(resolveArgoHome(env), "brain-v2.json");
    await mkdir(resolveArgoHome(env), { recursive: true });
    let raw: Record<string, string> = {};
    try { raw = JSON.parse(await readFile(file, "utf8")); } catch { /* new */ }
    raw[key] = value;
    await writeFile(file, JSON.stringify(raw, null, 2), "utf8");
  },
};

/** The active spec — Argo can replace this at runtime by calling evolveSpec(). */
let activeSpec: BrainV2Spec = BOOTSTRAP_SPEC;

/** Returns the active brain v2 spec. */
export function getActiveSpec(): BrainV2Spec {
  return activeSpec;
}

/** Argo calls this to replace the brain substrate with a new design. */
export function evolveSpec(newSpec: BrainV2Spec): void {
  activeSpec = newSpec;
}

/** Convenience: get a v2 digest using the active spec. */
export async function brainV2Digest(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  return activeSpec.digest(env);
}
