import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { transcribeAudio } from "../voice/whisper-stt.js";
import type { MediaBridgeDeps } from "./media.js";
import { cacheInboundMedia } from "./media-cache.js";

// MSG-MEDIA-IMAGES — the LIVE media-bridge wire: fetch a media url → base64, and
// transcribe inbound voice memos via the local whisper CLI. This is the injected
// boundary the pure bridge (media.ts) names; live transcription needs whisper
// installed, and an auth'd platform media url needs that channel's token.

const MIME_EXT: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
};

async function fetchBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  } catch {
    return null;
  }
}

async function transcribe(audioBase64: string, mime: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "vanta-voice-"));
  const path = join(dir, `audio.${MIME_EXT[mime] ?? "ogg"}`);
  try {
    writeFileSync(path, Buffer.from(audioBase64, "base64"));
    const r = transcribeAudio(path);
    return r.ok ? r.text : "";
  } catch {
    return "";
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

/** The live media-bridge deps (whisper STT + url fetch) for the gateway. */
export function buildMediaBridgeDeps(): MediaBridgeDeps {
  return {
    fetchBase64,
    transcribe,
    cache: (attachment, dataBase64) => cacheInboundMedia(attachment, dataBase64, { env: process.env }),
  };
}
