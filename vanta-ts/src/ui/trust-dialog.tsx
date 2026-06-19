import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";

// First-time trust gate. Before a project's CLAUDE.md/VANTA.md context loads, or
// before a new MCP server's tools mount, the operator confirms trust. The
// decision persists (settings/trust.ts) so the prompt fires once. This is a UX
// gate ON TOP of the kernel — denying just skips the load/mount; trusting does
// not weaken any later kernel assess().

/** What the operator is being asked to trust. */
export type TrustRequest =
  | { kind: "project"; name: string; files: { name: string; body: string }[] }
  | { kind: "mcp"; server: string; tools: { name: string; description?: string }[] };

const PREVIEW_LINES = 12;
const PREVIEW_TOOLS = 12;

type ContextFile = { name: string; body: string };

/** Clamp a context body to a short preview (pure). */
export function previewBody(body: string, maxLines = PREVIEW_LINES): string {
  const lines = body.trim().split("\n");
  if (lines.length <= maxLines) return lines.join("\n");
  return [...lines.slice(0, maxLines), `… (+${lines.length - maxLines} more lines)`].join("\n");
}

/** Non-empty line count of a context body (pure). */
export function lineCount(body: string): number {
  const trimmed = body.trim();
  return trimmed === "" ? 0 : trimmed.split("\n").length;
}

/** One-line summary for a context file: `name (N lines)` (pure). */
export function fileSummary(file: ContextFile): string {
  const n = lineCount(file.body);
  return `${file.name} (${n} ${n === 1 ? "line" : "lines"})`;
}

/** The dialog title for a request (pure). */
export function trustTitle(req: TrustRequest): string {
  return req.kind === "project"
    ? `Trust project "${req.name}"?`
    : `Trust MCP server "${req.server}"?`;
}

type Choice = { n: number; label: string; trusted: boolean };
const CHOICES: Choice[] = [
  { n: 1, label: "Yes, trust", trusted: true },
  { n: 2, label: "No, don't trust", trusted: false },
];

/** Default project view: context files as `name (N lines)`, no wall of text. */
function ProjectSummary(props: { files: ContextFile[] }): ReactElement {
  return (
    <Box flexDirection="column">
      <Text dimColor>This project ships context files Vanta would load into its prompt:</Text>
      {props.files.map((f) => (
        <Text key={f.name}>
          <Text bold>· {fileSummary(f)}</Text>
        </Text>
      ))}
    </Box>
  );
}

/** Expanded project view (after `v`): the full per-file previews. */
function ProjectPreview(props: { files: ContextFile[] }): ReactElement {
  return (
    <Box flexDirection="column">
      {props.files.map((f) => (
        <Box key={f.name} flexDirection="column" marginTop={1}>
          <Text bold>{f.name}</Text>
          <Text dimColor>{previewBody(f.body)}</Text>
        </Box>
      ))}
    </Box>
  );
}

function McpBody(props: { req: Extract<TrustRequest, { kind: "mcp" }> }): ReactElement {
  const { tools } = props.req;
  const shown = tools.slice(0, PREVIEW_TOOLS);
  return (
    <Box flexDirection="column">
      <Text dimColor>This MCP server registers {tools.length} tool(s) Vanta would be able to call:</Text>
      {shown.map((t) => (
        <Text key={t.name}>
          <Text bold>· {t.name}</Text>
          {t.description ? <Text dimColor> — {t.description}</Text> : null}
        </Text>
      ))}
      {tools.length > shown.length ? <Text dimColor>… (+{tools.length - shown.length} more)</Text> : null}
    </Box>
  );
}

/** One-line trust/deny/view ask for the project gate (the non-intrusive default). */
function ProjectAsk(): ReactElement {
  return (
    <Box marginTop={1}>
      <Text bold>Trust this project&apos;s context? </Text>
      <Text dimColor>[y] trust · [n] don&apos;t · [v] view</Text>
    </Box>
  );
}

/** Arrow-selectable list ask for the MCP gate (unchanged). */
function McpAsk(props: { sel: number }): ReactElement {
  return (
    <Box marginTop={1} flexDirection="column">
      <Text bold>Trust this and don&apos;t ask again?</Text>
      {CHOICES.map((c, i) => (
        <Text key={c.n}>
          {i === props.sel ? "❯" : " "} {c.n}. {c.label}
          {c.trusted ? null : <Text dimColor>  (esc)</Text>}
        </Text>
      ))}
    </Box>
  );
}

/** One discrete UI intent from a keypress; undefined = ignore the key. */
export type TrustKeyAction = "trust" | "deny" | "toggleView" | "up" | "down";

type Key = { escape: boolean; return: boolean; upArrow: boolean; downArrow: boolean };

/** Map a keypress to a project-gate action (pure): y/Enter=trust, n=deny, v=view. */
export function projectKeyAction(input: string, key: Key): TrustKeyAction | undefined {
  if (key.escape) return "deny";
  const ch = input.toLowerCase();
  if (ch === "y" || key.return) return "trust";
  if (ch === "n") return "deny";
  if (ch === "v") return "toggleView";
  return undefined;
}

/** Map a keypress to an MCP-gate action (pure): arrows move, Enter/1-2 decide. */
export function mcpKeyAction(input: string, key: Key, sel: number): TrustKeyAction | undefined {
  if (key.escape) return "deny";
  if (key.upArrow) return "up";
  if (key.downArrow) return "down";
  if (key.return) return CHOICES[sel]!.trusted ? "trust" : "deny";
  if (/^[1-2]$/.test(input)) return Number(input) === 1 ? "trust" : "deny";
  return undefined;
}

export function TrustDialog(props: { request: TrustRequest; onDecide: (trusted: boolean) => void }): ReactElement {
  const { request, onDecide } = props;
  const isProject = request.kind === "project";
  const [sel, setSel] = useState(0);
  const [viewing, setViewing] = useState(false);

  useInput((input, key) => {
    const action = isProject ? projectKeyAction(input, key) : mcpKeyAction(input, key, sel);
    if (action === "trust") onDecide(true);
    else if (action === "deny") onDecide(false);
    else if (action === "toggleView") setViewing((v) => !v);
    else if (action === "up") setSel((s) => (s + CHOICES.length - 1) % CHOICES.length);
    else if (action === "down") setSel((s) => (s + 1) % CHOICES.length);
  });

  return (
    <Box borderStyle="round" borderColor="white" flexDirection="column" paddingX={1} marginTop={1}>
      <Text bold>⚠ {trustTitle(request)}</Text>
      {!isProject ? <McpBody req={request} /> : viewing
        ? <ProjectPreview files={request.files} />
        : <ProjectSummary files={request.files} />}
      {isProject ? <ProjectAsk /> : <McpAsk sel={sel} />}
    </Box>
  );
}
