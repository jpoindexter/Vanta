import { isAbsolute, resolve } from "node:path";
import { supportsHyperlinks, osc8 } from "./osc8.js";
import { detectLinks, resolveLinkTarget, type LinkSpan } from "../ui/links.js";
import { resolveEditor, editorOpenUrl } from "../editor/open.js";

// String-level linkifier: take a block of rendered text and return it with every
// http/https URL and `path:line` ref wrapped in an OSC-8 hyperlink, so a click in
// a supporting terminal opens the browser / $VANTA_EDITOR. Pure (env + cwd in,
// string out). Degrades to the input unchanged on terminals without OSC-8.
//
// Distinct from `ui/linked-text.tsx` (Ink <Text> segments): this returns a raw
// string with the escape bytes inline, and it skips fenced code blocks so a path
// or URL shown as a code sample stays literal/copyable, never a live link.

const FENCE_RE = /^\s*```/;

/** The OSC-8 target URL for one detected span: a browser URL for links, or the
 *  configured editor's deep link / file:// URL for a file:line ref. Pure. */
function spanUrl(span: LinkSpan, env: NodeJS.ProcessEnv, cwd: string): string {
  const target = resolveLinkTarget(span);
  if (target.open === "browser") return target.url;
  const abs = isAbsolute(target.file) ? target.file : resolve(cwd, target.file);
  return editorOpenUrl(resolveEditor(env), abs, target.line);
}

/** Wrap every link span in one line with an OSC-8 hyperlink. Pure. */
function linkifyLine(line: string, env: NodeJS.ProcessEnv, cwd: string): string {
  const spans = detectLinks(line);
  if (spans.length === 0) return line;
  let out = "";
  let pos = 0;
  for (const span of spans) {
    if (span.start > pos) out += line.slice(pos, span.start);
    out += osc8(spanUrl(span, env, cwd), span.text, true);
    pos = span.end;
  }
  return out + line.slice(pos);
}

/** Wrap URLs and `path:line` refs in `text` as OSC-8 hyperlinks. Lines inside a
 *  ``` fenced code block are left untouched (a code sample stays literal). When
 *  the terminal lacks OSC-8 support, `text` is returned unchanged. Pure: env +
 *  cwd injected, no I/O. */
export function linkify(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string {
  if (!supportsHyperlinks(env)) return text;
  let inFence = false;
  const lines = text.split("\n");
  const out = lines.map((line) => {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      return line; // fence delimiters themselves are never links
    }
    return inFence ? line : linkifyLine(line, env, cwd);
  });
  return out.join("\n");
}
