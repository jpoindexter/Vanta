import type { Message } from "../types.js";

// HARNESS-IMAGE-SHRINK — vision-to-action screenshots bloat context and cause
// image_too_large / 413 failures. Two pure recoveries:
//   stripHistoricalImages — on compaction, drop images from all but the most
//     recent image-bearing message so old screenshots stop costing tokens.
//   stripAllImages — on a 413/image_too_large error, remove every image part
//     in-place (with a breadcrumb) so the turn RETRIES as text instead of
//     failing. Pure; the caller does the retry.

function hasImages(m: Message): boolean {
  return "images" in m && Array.isArray(m.images) && m.images.length > 0;
}

/** Drop the `images` field from a message, leaving its text intact. Pure. */
function withoutImages(m: Message): Message {
  if (!hasImages(m)) return m;
  const { images: _dropped, ...rest } = m as Message & { images?: unknown };
  return rest as Message;
}

/**
 * On compaction: keep images ONLY on the last `keepLast` image-bearing messages
 * (the recent screenshots the model may still need), stripping them from older
 * ones so historical media stops costing tokens. Returns a new array; `dropped`
 * counts messages whose images were removed. Pure.
 */
export function stripHistoricalImages(messages: Message[], keepLast = 1): { messages: Message[]; dropped: number } {
  const imageIdx = messages.map((m, i) => (hasImages(m) ? i : -1)).filter((i) => i >= 0);
  const keepCount = Math.max(0, keepLast);
  // slice(-0) returns the WHOLE array, so keepCount===0 must short-circuit to keep nothing.
  const keep = new Set(keepCount === 0 ? [] : imageIdx.slice(-keepCount));
  let dropped = 0;
  const out = messages.map((m, i) => {
    if (hasImages(m) && !keep.has(i)) {
      dropped += 1;
      return withoutImages(m);
    }
    return m;
  });
  return { messages: out, dropped };
}

/**
 * On a 413 / image_too_large error: strip EVERY image so the request retries as
 * text. A message that had images gets a breadcrumb appended so the model knows
 * an image was dropped (not silently lost). Returns a new array + how many
 * messages were stripped (0 → nothing to recover, don't bother retrying). Pure.
 */
export function stripAllImages(messages: Message[]): { messages: Message[]; stripped: number } {
  let stripped = 0;
  const out = messages.map((m) => {
    if (!hasImages(m)) return m;
    stripped += 1;
    const note = "[image omitted — too large for this request]";
    const bare = withoutImages(m);
    const content = bare.content ? `${bare.content}\n${note}` : note;
    return { ...bare, content } as Message;
  });
  return { messages: out, stripped };
}
