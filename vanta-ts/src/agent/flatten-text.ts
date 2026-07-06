// HARNESS-FLATTEN-TEXT — the one helper that returns the visible text of ANY
// provider message-content shape. Titling, logging, assertion-judging, and
// brain-ingest all need "just the words" from content that may be a plain
// string, a parts array (chat/Responses/Anthropic blocks), or an object with a
// text-ish key — while SKIPPING image/audio parts. Pure, total, never throws.

/** Common keys that carry a text payload across provider content shapes. */
const TEXT_KEYS = ["text", "content", "value", "input_text", "output_text"] as const;
/** Part `type`/`kind` values that are media, not text — skipped entirely. */
const MEDIA_TYPES = new Set(["image", "image_url", "input_image", "audio", "input_audio", "file", "tool_use", "tool_result"]);

function isMediaPart(part: Record<string, unknown>): boolean {
  const tag = String(part.type ?? part.kind ?? "").toLowerCase();
  return tag !== "" && MEDIA_TYPES.has(tag);
}

/** Pull a text string out of a single part/object, or "" when it has none. */
function partText(part: unknown): string {
  if (typeof part === "string") return part;
  if (part === null || typeof part !== "object") return "";
  const obj = part as Record<string, unknown>;
  if (isMediaPart(obj)) return "";
  for (const key of TEXT_KEYS) {
    const v = obj[key];
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return flattenMessageText(v); // nested parts (e.g. content: [...])
  }
  return "";
}

/**
 * Flatten any content shape to its visible text:
 *   string → itself; array → each text part joined (media parts dropped);
 *   object → the first text-ish key (recursing into a nested parts array);
 *   anything else → "". Never throws. Pure.
 */
export function flattenMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map(partText).filter((t) => t !== "").join("\n");
  }
  if (content && typeof content === "object") return partText(content);
  return "";
}
