import { open } from "node:fs/promises";
import { LocalDictationError } from "./local-dictation-input.js";

const MAX_NORMALIZED_BYTES = 60 * 32_000 + 128;
const invalidAudio = () => new LocalDictationError("Local audio could not be decoded. Try another recording.", 422);

/** Read only the bounded, private PCM file produced by our completed ffmpeg child. */
async function readNormalizedAudio(path: string, signal?: AbortSignal): Promise<Buffer> {
  const file = await open(path, "r");
  try {
    const size = (await file.stat()).size;
    if (size > MAX_NORMALIZED_BYTES) throw new LocalDictationError("Record no more than 60 seconds at a time.", 413);
    const buffer = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      signal?.throwIfAborted();
      const { bytesRead } = await file.read(buffer, offset, size - offset, offset);
      if (!bytesRead) throw invalidAudio();
      offset += bytesRead;
    }
    return buffer;
  } finally { await file.close(); }
}

function normalizedPcm(wav: Buffer): Buffer {
  requireWavHeader(wav);
  let validFormat = false;
  let pcm: Buffer | undefined;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const kind = wav.toString("ascii", offset, offset + 4);
    const length = wav.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + length > wav.length) throw invalidAudio();
    if (kind === "fmt ") validFormat = isNormalizedFormat(wav.subarray(start, start + length));
    if (kind === "data") pcm = wav.subarray(start, start + length);
    offset = start + length + (length % 2);
  }
  if (!validFormat || !pcm || pcm.length % 2 !== 0) throw invalidAudio();
  return pcm;
}

function requireWavHeader(wav: Buffer): void {
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") throw invalidAudio();
}

function isNormalizedFormat(format: Buffer): boolean {
  return format.length >= 16 && format.readUInt16LE(0) === 1
    && format.readUInt16LE(2) === 1 && format.readUInt32LE(4) === 16_000
    && format.readUInt16LE(14) === 16;
}

/** Exact digital silence only; nonzero quiet speech is not rejected by a threshold. */
export async function requireNonSilentDictation(path: string, signal?: AbortSignal): Promise<void> {
  const pcm = normalizedPcm(await readNormalizedAudio(path, signal));
  for (let offset = 0; offset < pcm.length; offset += 2) {
    if (pcm.readInt16LE(offset) !== 0) return;
  }
  throw new LocalDictationError("No speech was detected. Check your microphone and try again.", 422);
}
