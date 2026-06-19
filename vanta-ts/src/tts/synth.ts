import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResolvedTts } from "../routing/tts.js";

// Per-provider speech synthesis. speak.ts stays thin by dispatching here; each
// adapter is a real implementation that returns errors-as-values (never throws
// across the tool boundary). No network/CLI call happens at import time, so the
// pure registry/resolver tests run fully offline.

const run = promisify(execFile);
export type SpeakOutcome = { ok: boolean; output: string };

/** Play a synthesized audio file on macOS (`afplay`), best-effort. Pure shell. */
async function playFile(path: string): Promise<void> {
  await run("afplay", [path]);
}

/** macOS `say` — the local, offline backend (also Vanta's original path). */
async function sayLocal(text: string, voice?: string): Promise<SpeakOutcome> {
  try {
    await run("say", voice ? ["-v", voice, text] : [text]);
    return { ok: true, output: `spoke ${text.length} chars via local say` };
  } catch (err) {
    return { ok: false, output: `local TTS needs macOS 'say': ${(err as Error).message}` };
  }
}

/** Edge neural voices via the keyless `edge-tts` CLI → mp3 → afplay. */
async function sayEdge(text: string, voice?: string): Promise<SpeakOutcome> {
  let dir: string | undefined;
  try {
    dir = await mkdtemp(join(tmpdir(), "vanta-tts-"));
    const out = join(dir, "speech.mp3");
    await run("edge-tts", ["--voice", voice ?? "en-US-AriaNeural", "--text", text, "--write-media", out]);
    await playFile(out);
    return { ok: true, output: `spoke ${text.length} chars via edge (${voice ?? "en-US-AriaNeural"})` };
  } catch (err) {
    const msg = (err as Error).message;
    return {
      ok: false,
      output: /ENOENT|edge-tts/i.test(msg) ? "edge TTS needs the edge-tts CLI (pip install edge-tts)" : `edge TTS failed: ${msg}`,
    };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Synthesize via an HTTP API (OpenAI/ElevenLabs), write the bytes, then play. */
async function sayHttp(label: string, url: string, headers: Record<string, string>, body: unknown): Promise<SpeakOutcome> {
  let dir: string | undefined;
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    if (!res.ok) return { ok: false, output: `${label} TTS HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
    dir = await mkdtemp(join(tmpdir(), "vanta-tts-"));
    const out = join(dir, "speech.mp3");
    await writeFile(out, Buffer.from(await res.arrayBuffer()));
    await playFile(out);
    return { ok: true, output: `spoke via ${label}` };
  } catch (err) {
    return { ok: false, output: `${label} TTS failed: ${(err as Error).message}` };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Dispatch a resolved TTS provider to its synth adapter. Reads the key from env. */
export async function synthesize(text: string, r: ResolvedTts, env: NodeJS.ProcessEnv): Promise<SpeakOutcome> {
  const voice = r.voice;
  switch (r.provider.id) {
    case "local":
      return sayLocal(text, voice);
    case "edge":
      return sayEdge(text, voice);
    case "openai":
      return sayHttp("openai", "https://api.openai.com/v1/audio/speech", { authorization: `Bearer ${env.OPENAI_API_KEY ?? ""}` }, { model: "gpt-4o-mini-tts", voice: voice ?? "alloy", input: text });
    case "elevenlabs":
      return sayHttp("elevenlabs", `https://api.elevenlabs.io/v1/text-to-speech/${voice ?? "21m00Tcm4TlvDq8ikWAM"}`, { "xi-api-key": env.ELEVENLABS_API_KEY ?? "" }, { text, model_id: "eleven_turbo_v2_5" });
    default:
      return sayEdge(text, voice);
  }
}
