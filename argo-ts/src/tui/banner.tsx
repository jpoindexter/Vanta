import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { listSkills } from "../skills/store.js";
import { readMcpConfig } from "../mcp/mount.js";
import { groupToolsByDomain } from "./capabilities.js";
import type { RunSetup } from "../session.js";

// Startup banner — the first thing a session prints: an ASCII wordmark plus a
// one-card readout of what the agent is wired with (tools, skills, system
// prompt size, MCP servers). Modeled on the Hermes/Claude-Code startup card but
// fed entirely from Vanta's own subsystems — no fabricated numbers. Rendered
// inside Ink's <Static> by the App so it commits once and scrolls into the
// terminal's native scrollback instead of re-painting every frame.

// "ARGO" in ANSI-Shadow, matching docs/hermes-model.html.
const LOGO = [
  "  █████╗ ██████╗  ██████╗  ██████╗",
  " ██╔══██╗██╔══██╗██╔════╝ ██╔═══██╗",
  " ███████║██████╔╝██║  ███╗██║   ██║",
  " ██╔══██║██╔══██╗██║   ██║██║   ██║",
  " ██║  ██║██║  ██║╚██████╔╝╚██████╔╝",
  " ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝",
].join("\n");

export type BannerData = {
  model: string;
  sessionId: string;
  toolNames: string[];
  promptChars: number;
  /** null while the async load is in flight. */
  skillCount: number | null;
  /** null while the async load is in flight. */
  mcpServers: string[] | null;
};

/**
 * Collect the banner's facts from the live run. Sync fields (tools, prompt) are
 * read straight off `setup`; skills and MCP config are async file reads. Never
 * throws — a failed read degrades to an empty list, not a broken banner.
 */
export async function gatherBannerData(
  setup: RunSetup,
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BannerData> {
  const toolNames = setup.registry.schemas().map((s) => s.name);
  const [skills, mcp] = await Promise.all([
    listSkills(env).catch(() => []),
    readMcpConfig(env).catch(() => ({ servers: {} as Record<string, unknown> })),
  ]);
  return {
    model: setup.provider.modelId(),
    sessionId,
    toolNames,
    promptChars: setup.systemPrompt.length,
    skillCount: skills.length,
    mcpServers: Object.keys(mcp.servers ?? {}),
  };
}

function Section(props: { mark: string; title: string; meta?: string; children?: ReactElement }): ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text color="gray">{props.mark} </Text>
        <Text color="yellow">{props.title}</Text>
        {props.meta ? <Text dimColor> {props.meta}</Text> : null}
      </Text>
      {props.children}
    </Box>
  );
}

export function Banner(props: { data: BannerData }): ReactElement {
  const d = props.data;
  const domains = groupToolsByDomain(d.toolNames);
  const mcpCount = d.mcpServers?.length ?? 0;
  const skillLabel = d.skillCount === null ? "…" : `${d.skillCount} installed`;
  const mcpLabel = d.mcpServers === null ? "…" : `${mcpCount}`;

  return (
    <Box flexDirection="column" paddingX={1} marginBottom={1}>
      <Text color="cyan" bold>
        {LOGO}
      </Text>
      <Text dimColor>⚓ Trusted operator · Rust safety kernel + TypeScript agent</Text>

      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginTop={1}>
        <Text>
          <Text color="cyan" bold>
            ⚓ Vanta
          </Text>
          <Text dimColor>{`  ·  ${d.model}  ·  Session: ${d.sessionId}`}</Text>
        </Text>

        <Section mark="▾" title="Capabilities" meta={`(${d.toolNames.length} tools · ${domains.length} domains)`}>
          <Box flexDirection="column">
            {domains.map((g) => (
              <Text key={g.label}>
                {"    "}
                <Text color="cyan">{g.label}</Text>
                <Text dimColor>{`  ${g.tools.join(", ")}`}</Text>
              </Text>
            ))}
          </Box>
        </Section>

        <Section mark="▸" title="Available Skills" meta={`(${skillLabel})`} />
        <Section mark="▸" title="System Prompt" meta={`(${d.promptChars.toLocaleString()} chars)`} />

        {mcpCount > 0 && d.mcpServers ? (
          <Section mark="▾" title="MCP Servers">
            <Box flexDirection="column">
              {d.mcpServers.map((name) => (
                <Text key={name} color="white">
                  {"    "}
                  {name} <Text dimColor>[configured]</Text>
                </Text>
              ))}
            </Box>
          </Section>
        ) : null}

        <Box marginTop={1} borderStyle="single" borderColor="gray" borderTop borderBottom={false} borderLeft={false} borderRight={false}>
          <Text dimColor>
            {d.toolNames.length} tools · {skillLabel} · {mcpLabel} MCP server{mcpCount === 1 ? "" : "s"} ·{" "}
            <Text color="cyan">/help</Text> for commands
          </Text>
        </Box>
      </Box>

      <Text dimColor>
        {"\n"}Welcome to Vanta. Type your message or <Text color="cyan">/help</Text> for commands.
      </Text>
    </Box>
  );
}
