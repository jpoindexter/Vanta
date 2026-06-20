import { z } from "zod";

/**
 * VANTA-HINTS — a subprocess (a CLI/SDK run via shell_cmd) recommends a plugin
 * install WITHOUT the model having to infer it, by emitting a self-closing hint
 * tag to STDERR. Vanta STRIPS the tag from the captured output and SURFACES an
 * install suggestion. The native tag is `<vanta-hint .../>`; vendor spec lives
 * in docs/vanta-hints.md.
 */

const HintAttrs = z.object({
  type: z.string().min(1),
  name: z.string().min(1),
  marketplace: z.string().min(1).optional(),
});

export type VantaHint = z.infer<typeof HintAttrs>;

export type ParsedHints = { hints: VantaHint[]; stripped: string };

// One alternation matches the native tag AND the external interop alias. The
// `claude-code-hint` form is emitted by other tools; accepting it is interop
// only — the protocol identity stays Vanta-native (see docs/vanta-hints.md).
const HINT_TAG = /<(?:vanta-hint|claude-code-hint)\b([^>]*?)\/>/g;

const ATTR = /([a-zA-Z][\w-]*)\s*=\s*"([^"]*)"/g;

/** Parse `key="value"` pairs from a tag body, attribute-order-independent. */
function parseAttrs(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(ATTR)) {
    if (m[1] !== undefined && m[2] !== undefined) out[m[1]] = m[2];
  }
  return out;
}

/**
 * Find every self-closing hint tag in `text`, validate its attributes, and
 * return the parsed hints plus `text` with all hint tags removed. Malformed
 * tags (missing required type/name) are dropped from `hints` but still stripped
 * from the output, so the model never sees a hint tag regardless.
 */
export function parseVantaHints(text: string): ParsedHints {
  const hints: VantaHint[] = [];
  for (const m of text.matchAll(HINT_TAG)) {
    const parsed = HintAttrs.safeParse(parseAttrs(m[1] ?? ""));
    if (parsed.success) hints.push(parsed.data);
  }
  const stripped = text.replace(HINT_TAG, "");
  return { hints, stripped };
}

/** Format the operator-facing install suggestion for parsed plugin hints. */
export function formatHintSuggestion(hints: VantaHint[]): string {
  const lines = hints
    .filter((h) => h.type === "plugin")
    .map((h) => {
      const from = h.marketplace ? ` (from ${h.marketplace})` : "";
      return `Install ${h.name} plugin?${from}`;
    });
  return lines.join("\n");
}
