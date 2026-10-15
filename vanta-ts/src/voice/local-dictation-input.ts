export const MAX_DICTATION_BYTES = 4 * 1024 * 1024;

export class LocalDictationError extends Error {
  constructor(public readonly publicMessage: string, public readonly statusCode = 400) {
    super(publicMessage);
    this.name = "LocalDictationError";
  }
}

type Format = { extension: string; demuxer: string; matches: (data: Buffer) => boolean };
const textAt = (data: Buffer, text: string, offset = 0) => data.toString("ascii", offset, offset + text.length) === text;
const wav: Format = { extension: "wav", demuxer: "wav", matches: (b) => textAt(b, "RIFF") && textAt(b, "WAVE", 8) };
const webm: Format = { extension: "webm", demuxer: "matroska", matches: (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) };
const mp4: Format = { extension: "m4a", demuxer: "mov", matches: (b) => textAt(b, "ftyp", 4) };
const formats: Record<string, Format> = {
  "audio/wav": wav, "audio/x-wav": wav, "audio/wave": wav,
  "audio/webm": webm,
  "audio/ogg": { extension: "ogg", demuxer: "ogg", matches: (b) => textAt(b, "OggS") },
  "audio/mp4": mp4, "audio/x-m4a": mp4,
  "audio/mpeg": { extension: "mp3", demuxer: "mp3", matches: (b) => textAt(b, "ID3") || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0) },
  "audio/flac": { extension: "flac", demuxer: "flac", matches: (b) => textAt(b, "fLaC") },
  "audio/aiff": { extension: "aiff", demuxer: "aiff", matches: (b) => textAt(b, "FORM") && (textAt(b, "AIFF", 8) || textAt(b, "AIFC", 8)) },
};

export function validateDictationAudio(audio: Uint8Array, mimeType: string): Format {
  if (!audio.length) throw new LocalDictationError("Record some audio first.");
  if (audio.length > MAX_DICTATION_BYTES) throw new LocalDictationError("Audio exceeds the 4 MiB limit. Record a shorter clip.", 413);
  const format = formats[mimeType.split(";")[0]?.trim().toLowerCase() ?? ""];
  if (!format || audio.length < 12 || !format.matches(Buffer.from(audio))) {
    throw new LocalDictationError("Unsupported or invalid audio. Use WAV, WebM, Ogg, M4A, MP3, FLAC, or AIFF.", 415);
  }
  return format;
}

export function decodeDictationAudio(value: string): Uint8Array {
  if (value.length > Math.ceil(MAX_DICTATION_BYTES / 3) * 4) throw new LocalDictationError("Audio exceeds the 4 MiB limit.", 413);
  if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new LocalDictationError("Audio must be valid base64.");
  const audio = Buffer.from(value, "base64");
  if (audio.toString("base64") !== value) throw new LocalDictationError("Audio must be valid base64.");
  return audio;
}
