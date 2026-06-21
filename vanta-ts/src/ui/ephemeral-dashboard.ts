/**
 * EPHEMERAL-UI-GEN — pure dashboard-HTML builder + serve-plan helpers.
 *
 * A task-specific visual (status board, comparison table, progress dashboard)
 * is a tool call, not a build: structured data → a self-contained HTML page
 * with NO external assets/scripts, served on a localhost port that auto-closes.
 *
 * This file is the PURE half (builder + port resolution + enable flag). The
 * live HTTP serve is the documented boundary — see the bottom-of-file note for
 * where an `ephemeral_ui` tool would buildDashboardHtml + serve it.
 *
 * SECURITY: the page embeds AGENT-PROVIDED data, so every interpolated value is
 * HTML-escaped (`<>&"'`) — a `<script>` in a value renders as inert text, never
 * a live tag. No inline event handlers, no `<script>`, no external links.
 */

/** A key/value pair section: a labelled list of label→value rows. */
export interface KeyValueSection {
  readonly heading: string;
  readonly kind: "keyvalue";
  readonly rows: ReadonlyArray<{ readonly label: string; readonly value: string }>;
}

/** A table section: header columns + a grid of string cells. */
export interface TableSection {
  readonly heading: string;
  readonly kind: "table";
  readonly columns: readonly string[];
  readonly rows: ReadonlyArray<readonly string[]>;
}

/** A free-text section: a heading + a body paragraph. */
export interface TextSection {
  readonly heading: string;
  readonly kind: "text";
  readonly body: string;
}

export type DashboardSection = KeyValueSection | TableSection | TextSection;

/** The full structured input for a one-off dashboard. */
export interface DashboardSpec {
  readonly title: string;
  readonly sections: readonly DashboardSection[];
}

/** Default port when `VANTA_EPHEMERAL_PORT` is unset/invalid. */
export const DEFAULT_EPHEMERAL_PORT = 7790;
const MIN_PORT = 1024;
const MAX_PORT = 65535;

/**
 * HTML-escape a value so agent-provided data can never inject a tag or break
 * out of an attribute. Order matters: `&` first so later entities aren't
 * double-escaped. Covers the five XSS-relevant characters.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderKeyValue(section: KeyValueSection): string {
  const rows = section.rows
    .map(
      (r) =>
        `<tr><th scope="row">${escapeHtml(r.label)}</th><td>${escapeHtml(r.value)}</td></tr>`,
    )
    .join("");
  return `<table class="kv">${rows}</table>`;
}

function renderTable(section: TableSection): string {
  const head = section.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
  const body = section.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderSection(section: DashboardSection): string {
  const heading = `<h2>${escapeHtml(section.heading)}</h2>`;
  let inner: string;
  if (section.kind === "keyvalue") inner = renderKeyValue(section);
  else if (section.kind === "table") inner = renderTable(section);
  else inner = `<p class="text">${escapeHtml(section.body)}</p>`;
  return `<section>${heading}${inner}</section>`;
}

const STYLE = `*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0c0f14;color:#c8cdd8;padding:1.5rem;line-height:1.5}
h1{font-size:1.3rem;font-weight:600;margin-bottom:1.25rem;color:#e8eaf0}
section{background:#10141b;border:1px solid #1e2737;padding:1rem;margin-bottom:1rem}
h2{font-size:.8rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#5e6e82;margin-bottom:.65rem;font-family:ui-monospace,monospace}
table{width:100%;border-collapse:collapse;font-size:.82rem}
th,td{text-align:left;padding:.35rem .55rem;border-bottom:1px solid #1e2737;vertical-align:top}
table.grid thead th{color:#a0aab8;font-weight:700;font-size:.7rem;text-transform:uppercase;letter-spacing:.05em}
table.kv th{color:#7a8898;font-weight:600;width:14rem}
td{color:#c8cdd8}
p.text{font-size:.85rem;color:#a0aab8;white-space:pre-wrap}
.empty{color:#5e6e82;font-size:.85rem}`;

function shell(titleHtml: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titleHtml}</title>
<style>${STYLE}</style>
</head>
<body>
<h1>${titleHtml}</h1>
${bodyHtml}
</body>
</html>`;
}

/**
 * Build a complete self-contained HTML dashboard from structured data.
 * No external assets, no scripts: inline `<style>` only. ALL data is
 * HTML-escaped. An empty spec (no title + no sections) → a minimal
 * "no data" page.
 */
export function buildDashboardHtml(spec: DashboardSpec): string {
  const title = spec.title.trim() === "" ? "Dashboard" : spec.title;
  const titleHtml = escapeHtml(title);
  if (spec.sections.length === 0) {
    return shell(titleHtml, `<section><p class="empty">No data to display.</p></section>`);
  }
  const body = spec.sections.map(renderSection).join("\n");
  return shell(titleHtml, body);
}

/**
 * Resolve the ephemeral serve port from `VANTA_EPHEMERAL_PORT`, falling back
 * to {@link DEFAULT_EPHEMERAL_PORT}. Clamped to the unprivileged range
 * 1024..65535; an unset/non-numeric value yields the default.
 */
export function resolveEphemeralPort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.VANTA_EPHEMERAL_PORT;
  const parsed = raw === undefined ? NaN : Number(raw);
  if (!Number.isInteger(parsed)) return DEFAULT_EPHEMERAL_PORT;
  return Math.min(MAX_PORT, Math.max(MIN_PORT, parsed));
}

/**
 * Whether ephemeral-UI generation is enabled. OFF by default; opt in with
 * `VANTA_EPHEMERAL_UI=1`.
 */
export function ephemeralUiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VANTA_EPHEMERAL_UI === "1";
}

/**
 * BOUNDARY (not built this round): an `ephemeral_ui` tool would call
 * {@link buildDashboardHtml} on validated structured data, then serve the
 * string from a localhost Node `http` server (mirroring `roadmap/server.ts`'s
 * `createRoadmapServer`/`serveRoadmap` style) bound to `127.0.0.1` on
 * {@link resolveEphemeralPort}, with an auto-close timeout (the dashboard's
 * lifetime), returning the `http://localhost:<port>` URL to the operator.
 * The live serve is the injected, documented boundary — exactly like the
 * clarity-gate tools name their live edge. Gated by {@link ephemeralUiEnabled}.
 */
