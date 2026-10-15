import type http from "node:http";
import { z } from "zod";
import { getLocalDictationStatus, LocalDictationError, MAX_DICTATION_BYTES, transcribeLocalAudio } from "../voice/local-dictation.js";
import { decodeDictationAudio } from "../voice/local-dictation-input.js";
import { sendJson } from "./handlers.js";

const MAX_BODY_BYTES = Math.ceil(MAX_DICTATION_BYTES / 3) * 4 + 1024;
const BodySchema = z.object({ audioBase64: z.string(), mimeType: z.string().max(128) }).strict();
type VoiceApiDeps = { status?: typeof getLocalDictationStatus; transcribe?: typeof transcribeLocalAudio };

export async function handleDesktopVoiceStatus(res: http.ServerResponse, deps: VoiceApiDeps = {}): Promise<void> {
  try { sendJson(res, 200, await (deps.status ?? getLocalDictationStatus)()); }
  catch {
    const reason = "Local dictation is unavailable. Check the local installation.";
    sendJson(res, 503, { ready: false, provider: "local-whisper", model: "tiny", reason, error: reason });
  }
}

async function readAudioBody(req: http.IncomingMessage): Promise<unknown> {
  if (req.headers["content-type"]?.split(";")[0]?.trim() !== "application/json") throw new LocalDictationError("Send audio as JSON.", 415);
  if (Number(req.headers["content-length"]) > MAX_BODY_BYTES) throw new LocalDictationError("Audio request exceeds the size limit.", 413);
  const chunks: Buffer[] = [];
  let size = 0;
  // Do not let an oversized stream accumulate in memory, even without Content-Length.
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += bytes.length;
    if (size > MAX_BODY_BYTES) throw new LocalDictationError("Audio request exceeds the size limit.", 413);
    chunks.push(bytes);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new LocalDictationError("Audio request must contain valid JSON."); }
}

function discardRejectedBody(req: http.IncomingMessage): void {
  if (req.complete) return;
  // Drain without retaining bytes so clients can receive the error during upload.
  // An endless rejected upload gets only a bounded grace period.
  const timer = setTimeout(() => req.destroy(), 5_000);
  timer.unref();
  req.once("end", () => clearTimeout(timer));
  req.once("close", () => clearTimeout(timer));
  req.resume();
}

export async function handleDesktopVoiceTranscribe(req: http.IncomingMessage, res: http.ServerResponse, deps: VoiceApiDeps = {}): Promise<void> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  req.once("aborted", abort);
  res.once("close", abort);
  const timeout = setTimeout(() => { abort(); if (!req.complete) req.destroy(); }, 130_000);
  try {
    const parsed = BodySchema.safeParse(await readAudioBody(req));
    if (!parsed.success) throw new LocalDictationError("Provide audioBase64 and mimeType.");
    const audio = decodeDictationAudio(parsed.data.audioBase64);
    const result = await (deps.transcribe ?? transcribeLocalAudio)({ audio, mimeType: parsed.data.mimeType, signal: controller.signal });
    if (!res.destroyed) sendJson(res, 200, result);
  } catch (error) {
    const safe = error instanceof LocalDictationError ? error : new LocalDictationError("Local transcription failed. Try again.", 500);
    if (!res.destroyed) {
      discardRejectedBody(req);
      sendJson(res, safe.statusCode, { error: safe.publicMessage });
    }
  } finally {
    clearTimeout(timeout);
    req.off("aborted", abort);
    res.off("close", abort);
  }
}
