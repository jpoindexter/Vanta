import { type ReactElement } from "react";
import { Text } from "ink";
import { isAbsolute, resolve } from "node:path";
import { detectLinks, resolveLinkTarget, type LinkSpan } from "./links.js";
import { supportsHyperlinks, osc8 } from "../term/osc8.js";
import { resolveEditor, editorOpenUrl } from "../editor/open.js";

// Render one transcript line with http/https links and file/file:line paths made
// clickable via OSC-8 (terminals that support it open the URL/editor on click;
// others show plain, still-copyable text — paste a path into /open as the
// key-to-open fallback). Splitting is a pure function so it's unit-testable.

export type LinkedSegment = { text: string; url?: string };

/** Resolve a span to the OSC-8 target URL: a browser URL for links, or the
 *  configured editor's deep link / file:// URL for file paths (line-aware). Pure
 *  given env + cwd. */
function spanUrl(span: LinkSpan, env: NodeJS.ProcessEnv, cwd: string): string {
  const target = resolveLinkTarget(span);
  if (target.open === "browser") return target.url;
  const abs = isAbsolute(target.file) ? target.file : resolve(cwd, target.file);
  return editorOpenUrl(resolveEditor(env), abs, target.line);
}

/** Split `line` into plain + linked segments. Pure: no I/O, env/cwd injected. */
export function buildLinkedSegments(
  line: string,
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): LinkedSegment[] {
  const spans = detectLinks(line);
  if (spans.length === 0) return [{ text: line }];
  const out: LinkedSegment[] = [];
  let pos = 0;
  for (const span of spans) {
    if (span.start > pos) out.push({ text: line.slice(pos, span.start) });
    out.push({ text: span.text, url: spanUrl(span, env, cwd) });
    pos = span.end;
  }
  if (pos < line.length) out.push({ text: line.slice(pos) });
  return out;
}

/** A line of text with any links wrapped as OSC-8 hyperlinks (when the terminal
 *  supports them). Underlines linked spans so they read as affordances. */
export function LinkedText(props: { text: string }): ReactElement {
  const enabled = supportsHyperlinks();
  const segs = buildLinkedSegments(props.text);
  return (
    <Text>
      {segs.map((s, i) =>
        s.url
          ? <Text key={i} underline>{osc8(s.url, s.text, enabled)}</Text>
          : <Text key={i}>{s.text}</Text>,
      )}
    </Text>
  );
}
