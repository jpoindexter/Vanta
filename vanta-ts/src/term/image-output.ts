// VANTA-BASH-IMAGE-OUTPUT — render a base64 `data:image/...` URI in shell stdout
// as an inline terminal image instead of dumping the raw base64 string.
//
// Pure detector + formatter (no terminal needed to test — assert the escape bytes).
// The inline-image escape uses iTerm2's OSC 1337 protocol, mirroring the
// OSC-8 hyperlink precedent in `osc8.ts`:
//   ESC ] 1337 ; File = inline=1 ; size=<bytes> : <base64> BEL
// Spec: https://iterm2.com/documentation-images.html

const OSC = "\x1b]1337;";
const BEL = "\x07";

/** Mime types we treat as inline-renderable images. */
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp", "image/bmp"]);

/** A parsed data-URI image: the declared mime and its base64 payload. */
export type DataUriImage = { mime: string; base64: string };

// data:<mime>;base64,<payload> — mime captured, base64 payload captured. The
// payload is the standard base64 alphabet (anchored to end so trailing junk
// after the URI never sneaks in as image bytes).
const DATA_URI = /data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})\s*$/i;

/**
 * Detect a base64 data-URI image in `text` (the whole stdout, trimmed). Returns
 * the parsed `{mime, base64}` only when the text IS a single data URI (optionally
 * surrounded by whitespace) for a known image mime; otherwise null. Pure — normal
 * shell output (logs, JSON, even text that mentions "data:image") returns null
 * because the URI must span the entire trimmed output. No side effects.
 */
export function detectDataUriImage(text: string): DataUriImage | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("data:image/")) return null;
  const m = DATA_URI.exec(trimmed);
  const rawMime = m?.[1];
  const base64 = m?.[2];
  if (!rawMime || !base64) return null;
  const mime = rawMime.toLowerCase();
  if (!IMAGE_MIMES.has(mime)) return null;
  return { mime, base64 };
}

/** Decoded byte length of a base64 payload (for the `size=` field + placeholder). */
function decodedByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

/**
 * The iTerm2 OSC 1337 inline-image escape sequence for a parsed data URI. Pure —
 * given the same image it always returns the same bytes, so the formatter is
 * fully assertable without a terminal. The image is preserved aspect ratio and
 * sized to fit the current cell width.
 */
export function renderInlineImage(image: DataUriImage): string {
  const size = decodedByteLength(image.base64);
  const args = `File=inline=1;size=${size};preserveAspectRatio=1`;
  return `${OSC}${args}:${image.base64}${BEL}`;
}

/**
 * A short, clip-safe placeholder shown in the activity feed in place of the raw
 * base64 (e.g. `[inline image · image/png · 1.2 KB]`). Pure. This is what the
 * summary string carries; the actual pixels are emitted via `renderInlineImage`.
 */
export function inlineImagePlaceholder(image: DataUriImage): string {
  const bytes = decodedByteLength(image.base64);
  const human = bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
  return `[inline image · ${image.mime} · ${human}]`;
}

/** Env/TTY the inline-image emitter needs, injected so the side effect is testable. */
export type InlineImageDeps = {
  env?: NodeJS.ProcessEnv;
  isTTY?: boolean;
  write?: (chunk: string) => void;
};

/** Terminals known to render the OSC 1337 inline-image protocol. Conservative:
 *  an unknown terminal falls back to the placeholder only (raw base64 stays hidden). */
function isKnownInlineImageTerm(env: NodeJS.ProcessEnv): boolean {
  const program = (env.TERM_PROGRAM ?? "").toLowerCase();
  if (program === "iterm.app" || program === "wezterm") return true;
  if (env.KITTY_WINDOW_ID) return true;
  return (env.TERM ?? "").includes("kitty"); // kitty tolerates OSC 1337
}

/** Whether an inline image should be emitted: explicit `VANTA_INLINE_IMAGES`
 *  override first, then a known-terminal check. */
function supportsInlineImages(env: NodeJS.ProcessEnv): boolean {
  const override = (env.VANTA_INLINE_IMAGES ?? "").toLowerCase();
  if (override === "1" || override === "true") return true;
  if (override === "0" || override === "false") return false;
  return isKnownInlineImageTerm(env);
}

/**
 * If `text` is a data-URI image, emit the inline image to the terminal (TTY +
 * supported terminal only) and return its clip-safe placeholder summary. Returns
 * null when `text` is not an image (caller keeps its existing summary). The write
 * is the only side effect; everything else is pure. Never throws — a write
 * failure degrades to the placeholder.
 */
export function emitInlineImage(text: string, deps: InlineImageDeps = {}): string | null {
  const image = detectDataUriImage(text);
  if (!image) return null;
  const env = deps.env ?? process.env;
  const isTTY = deps.isTTY ?? Boolean(process.stdout?.isTTY);
  if (isTTY && supportsInlineImages(env)) {
    const write = deps.write ?? ((c: string) => process.stdout.write(c));
    try {
      write(`${renderInlineImage(image)}\n`);
    } catch {
      /* a failed write degrades to the placeholder — never throw across the boundary */
    }
  }
  return inlineImagePlaceholder(image);
}
