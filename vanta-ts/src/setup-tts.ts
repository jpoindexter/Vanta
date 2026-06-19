import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface, type Interface as Readline } from "node:readline/promises";
import { TTS_CATALOG, ttsAvailability, ttsProviderById, type TtsProvider } from "./tts/registry.js";
import { envPath, promptSecret, upsertEnv } from "./setup.js";

// `vanta setup tts` — the voice/TTS-provider wizard. Mirrors runMessagingSetup:
// lists backends with availability, configures the chosen one (writes
// VANTA_TTS_PROVIDER + its voice + any key via the shared upsertEnv so other keys
// survive), 0600 write, hidden key prompt. Pure render/build helpers below are
// unit-tested; runTtsSetup is the I/O shell.

/** Env keys a chosen TTS provider implies: provider id + voice + optional key. Pure. */
export function buildTtsEnv(
  provider: TtsProvider,
  key?: string,
  voice?: string,
): Record<string, string> {
  const updates: Record<string, string> = { VANTA_TTS_PROVIDER: provider.id };
  const v = voice?.trim() || provider.defaultVoice;
  if (v) updates.VANTA_TTS_VOICE = v;
  if (provider.envVar && key) updates[provider.envVar] = key;
  return updates;
}

function status(provider: TtsProvider, env: NodeJS.ProcessEnv): string {
  if (provider.keyless || !provider.envVar) return "available";
  return ttsAvailability(provider, env).configured ? "configured" : "needs key";
}

/** The numbered backend menu with a status tag per row. Pure. */
export function renderTtsMenu(env: NodeJS.ProcessEnv): string {
  return TTS_CATALOG.map(
    (p, i) => `  ${i + 1}. ${p.label}  [${status(p, env)}]`,
  ).join("\n");
}

/** Prerequisite + link + ordered steps for one backend. Pure. */
export function renderTtsSteps(provider: TtsProvider): string {
  const lines = [`\n  ${provider.label} setup:`];
  if (provider.prerequisite) lines.push(`  prerequisite: ${provider.prerequisite}`);
  if (provider.signupUrl) lines.push(`  link: ${provider.signupUrl}`);
  provider.setupSteps.forEach((s, i) => lines.push(`    ${i + 1}. ${s}`));
  return lines.join("\n");
}

/**
 * Run the TTS wizard. Returns true if env was written. `rl` is injectable for
 * tests; a real TTY is created when omitted. The chosen key is read hidden and
 * never echoed/logged.
 */
export async function runTtsSetup(repoRoot: string, rl?: Readline): Promise<boolean> {
  const ownRl = rl ?? createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log("\n  Vanta voice setup — pick a text-to-speech backend.\n");
    console.log(renderTtsMenu(process.env));

    const pick = (await ownRl.question(`\n  Backend [1-${TTS_CATALOG.length}]: `)).trim();
    const provider = TTS_CATALOG[Number.parseInt(pick, 10) - 1];
    if (!provider) {
      console.log("  No valid backend chosen. Nothing written.");
      return false;
    }

    console.log(renderTtsSteps(provider));

    let key: string | undefined;
    if (provider.envVar) {
      key = await promptSecret(ownRl, `\n  Paste your ${provider.envVar} (hidden): `);
      if (!key) {
        console.log("  No value entered. Nothing written.");
        return false;
      }
    }

    const voice = (await ownRl.question(`\n  Voice id [${provider.defaultVoice ?? "default"}]: `)).trim();

    const path = envPath(repoRoot);
    const existing = existsSync(path) ? await readFile(path, "utf8") : "";
    await writeFile(path, upsertEnv(existing, buildTtsEnv(provider, key, voice)), { mode: 0o600 });

    console.log(`\n  ✓ Configured ${provider.label} for spoken replies.\n`);
    return true;
  } finally {
    if (!rl) ownRl.close();
  }
}

export { ttsProviderById };
