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

/** Clamp a context body to a short preview (pure). */
export function previewBody(body: string, maxLines = PREVIEW_LINES): string {
  const lines = body.trim().split("\n");
  if (lines.length <= maxLines) return lines.join("\n");
  return [...lines.slice(0, maxLines), `… (+${lines.length - maxLines} more lines)`].join("\n");
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

function ProjectBody(props: { req: Extract<TrustRequest, { kind: "project" }> }): ReactElement {
  return (
    <Box flexDirection="column">
      <Text dimColor>This project ships context files that will be loaded into Vanta's prompt:</Text>
      {props.req.files.map((f) => (
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

export function TrustDialog(props: { request: TrustRequest; onDecide: (trusted: boolean) => void }): ReactElement {
  const { request, onDecide } = props;
  const [sel, setSel] = useState(0);
  const pick = (i: number): void => onDecide(CHOICES[i]!.trusted);

  useInput((input, key) => {
    if (key.upArrow) setSel((s) => (s + CHOICES.length - 1) % CHOICES.length);
    else if (key.downArrow) setSel((s) => (s + 1) % CHOICES.length);
    else if (key.return) pick(sel);
    else if (key.escape) pick(1);
    else if (/^[1-2]$/.test(input)) pick(Number(input) - 1);
  });

  return (
    <Box borderStyle="round" borderColor="white" flexDirection="column" paddingX={1} marginTop={1}>
      <Text bold>⚠ {trustTitle(request)}</Text>
      {request.kind === "project" ? <ProjectBody req={request} /> : <McpBody req={request} />}
      <Box marginTop={1} flexDirection="column">
        <Text bold>Trust this and don't ask again?</Text>
        {CHOICES.map((c, i) => (
          <Text key={c.n}>
            {i === sel ? "❯" : " "} {c.n}. {c.label}
            {c.trusted ? null : <Text dimColor>  (esc)</Text>}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
