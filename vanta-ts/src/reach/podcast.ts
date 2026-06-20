import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { assertPublicUrl } from "../net/ssrf-guard.js";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";
const MAX_AUDIO_BYTES = 24 * 1024 * 1024; // 24 MB (Groq hard limit is 25 MB)
const DOWNLOAD_TIMEOUT_MS = 120_000;
const TRANSCRIBE_TIMEOUT_MS = 120_000;

export type TranscriptResult =
  | { ok: true; transcript: string; durationSeconds?: number }
  | { ok: false; error: string };

async function downloadAudio(url: string, destDir: string): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const guard = await assertPublicUrl(url);
  if (!guard.ok) return { ok: false, error: guard.error };
  const ext = extname(new URL(url).pathname) || ".mp3";
  const dest = join(destDir, `audio${ext}`);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return { ok: false, error: `download failed: HTTP ${res.status}` };
    if (!res.body) return { ok: false, error: "empty response body" };
    const ws = createWriteStream(dest);
    await pipeline(Readable.fromWeb(res.body as import("stream/web").ReadableStream), ws);
    const { size } = await stat(dest);
    if (size > MAX_AUDIO_BYTES) return { ok: false, error: `audio file is ${(size / 1024 / 1024).toFixed(1)} MB — exceeds 24 MB Groq limit` };
    return { ok: true, path: dest };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

async function callGroqWhisper(
  audioPath: string,
  apiKey: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const { readFile } = await import("node:fs/promises");
  const buf = await readFile(audioPath);
  const ext = extname(audioPath).slice(1) || "mp3";
  const form = new FormData();
  form.append("file", new Blob([buf], { type: `audio/${ext}` }), basename(audioPath));
  form.append("model", "whisper-large-v3");
  form.append("response_format", "json");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TRANSCRIBE_TIMEOUT_MS);
  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: ctrl.signal,
    });
    const body = await res.json() as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: String((body as { error?: { message?: string } }).error?.message ?? res.status) };
    return { ok: true, text: String(body["text"] ?? "") };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

export async function transcribePodcastUrl(
  url: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<TranscriptResult> {
  const apiKey = env["GROQ_API_KEY"];
  if (!apiKey) return { ok: false, error: "GROQ_API_KEY not set — get a free key at console.groq.com" };
  const dir = join(tmpdir(), `vanta-podcast-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  try {
    const dl = await downloadAudio(url, dir);
    if (!dl.ok) return { ok: false, error: dl.error };
    const tr = await callGroqWhisper(dl.path, apiKey);
    if (!tr.ok) return { ok: false, error: tr.error };
    return { ok: true, transcript: tr.text };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
