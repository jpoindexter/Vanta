import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { listSkills } from "../skills/store.js";
import { readMcpConfig } from "../mcp/mount.js";
import { groupToolsByDomain } from "./capabilities.js";
import type { RunSetup } from "../session.js";

// Startup banner — the first thing a session shows: the ASCII wordmark plus a
// title-bordered two-column card (left: identity + session meta, right: the
// live capability inventory), Hermes/Claude-Code style. Fed entirely from
// Vanta's own subsystems — no fabricated numbers. Normal mode renders it once
// inside <Static>; alt-screen mode renders it as the first transcript entry so
// it scrolls into history like everything else.

// "VANTA" in ANSI-Shadow.
const LOGO = [
  "██╗   ██╗ █████╗ ███╗   ██╗████████╗ █████╗ ",
  "██║   ██║██╔══██╗████╗  ██║╚══██╔══╝██╔══██╗",
  "██║   ██║███████║██╔██╗ ██║   ██║   ███████║",
  "╚██╗ ██╔╝██╔══██║██║╚██╗██║   ██║   ██╔══██║",
  " ╚████╔╝ ██║  ██║██║ ╚████║   ██║   ██║  ██║",
  "  ╚═══╝  ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝",
].join("\n");

const NARROW_CARD = 84; // below this, columns stack vertically
const META_COL = 30; // left column width in two-column layout

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

const truncate = (s: string, max: number): string => (s.length > max ? `${s.slice(0, Math.max(0, max - 1))}…` : s);

/**
 * Top border with an inline title — `╭─ title ───╮` — exactly `width` chars
 * wide (matches a round-bordered Box below it with borderTop disabled). Title
 * must be single-width glyphs; it is clipped to fit.
 */
export function borderTitle(title: string, width: number): { pre: string; text: string; post: string } {
  const text = truncate(title, Math.max(1, width - 6));
  const pad = width - text.length - 5; // ╭ ─ space … space ─×pad ╮
  return { pre: "╭─ ", text, post: ` ${"─".repeat(Math.max(1, pad))}╮` };
}

/** Shorten an absolute path for display: home → `~`, clipped from the left.
 * Default budget = meta column minus its `root ` label, padding and rule. */
export function shortPath(p: string, max = META_COL - 8): string {
  const home = process.env.HOME ?? "";
  const tilde = home && p.startsWith(home) ? `~${p.slice(home.length)}` : p;
  return tilde.length > max ? `…${tilde.slice(-(max - 1))}` : tilde;
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

/** Left column: identity + session meta (model, root, session id). */
function MetaColumn(props: { d: BannerData; root?: string; narrow: boolean }): ReactElement {
  const { d, root, narrow } = props;
  return (
    <Box
      flexDirection="column"
      width={narrow ? undefined : META_COL}
      flexShrink={0}
      paddingRight={1}
      marginTop={1}
      {...(narrow ? {} : { borderStyle: "single" as const, borderColor: "gray", borderRight: true, borderTop: false, borderBottom: false, borderLeft: false })}
    >
      <Text color="cyan" bold>
        ⚓ Vanta
      </Text>
      <Text dimColor>trusted operator</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text>
          <Text color="gray">model </Text>
          <Text color="white">{d.model}</Text>
        </Text>
        {root ? (
          <Text>
            <Text color="gray">root </Text>
            <Text dimColor>{shortPath(root)}</Text>
          </Text>
        ) : null}
        <Text>
          <Text color="gray">session </Text>
          <Text dimColor>{d.sessionId}</Text>
        </Text>
      </Box>
    </Box>
  );
}

/** Right column: the live capability inventory, grouped by domain. */
function InventoryColumn(props: { d: BannerData; skillLabel: string; mcpCount: number }): ReactElement {
  const { d, skillLabel, mcpCount } = props;
  const domains = groupToolsByDomain(d.toolNames);
  return (
    <Box flexDirection="column" flexGrow={1} paddingLeft={1}>
      <Section mark="▾" title="Capabilities" meta={`(${d.toolNames.length} tools · ${domains.length} domains)`}>
        <Box flexDirection="column">
          {domains.map((g) => (
            <Text key={g.label}>
              {"  "}
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
                {"  "}
                {name} <Text dimColor>[configured]</Text>
              </Text>
            ))}
          </Box>
        </Section>
      ) : null}
    </Box>
  );
}

export function Banner(props: { data: BannerData; root?: string }): ReactElement {
  const d = props.data;
  // Read columns directly: <Static> renders once at startup width; in
  // alt-screen mode every commit re-renders the entry, so resizes track.
  const cols = process.stdout.columns ?? 80;
  const width = Math.max(56, Math.min(cols - 4, 130));
  const narrow = width < NARROW_CARD;
  const title = borderTitle("Vanta · trusted operator", width);
  const mcpCount = d.mcpServers?.length ?? 0;
  const skillLabel = d.skillCount === null ? "…" : `${d.skillCount} installed`;
  const mcpLabel = d.mcpServers === null ? "…" : `${mcpCount}`;

  return (
    <Box flexDirection="column" paddingX={1} marginBottom={1}>
      <Text color="cyan" bold>
        {LOGO}
      </Text>
      <Text dimColor>⚓ Trusted operator · Rust safety kernel + TypeScript agent</Text>

      <Box flexDirection="column" width={width} marginTop={1}>
        <Text>
          <Text color="gray">{title.pre}</Text>
          <Text color="cyan" bold>
            {title.text}
          </Text>
          <Text color="gray">{title.post}</Text>
        </Text>
        <Box flexDirection="column" borderStyle="round" borderColor="gray" borderTop={false} paddingX={1}>
          <Box flexDirection={narrow ? "column" : "row"}>
            <MetaColumn d={d} root={props.root} narrow={narrow} />
            <InventoryColumn d={d} skillLabel={skillLabel} mcpCount={mcpCount} />
          </Box>
          <Box marginTop={1} borderStyle="single" borderColor="gray" borderTop borderBottom={false} borderLeft={false} borderRight={false}>
            <Text dimColor>
              {d.toolNames.length} tools · {skillLabel} · {mcpLabel} MCP server{mcpCount === 1 ? "" : "s"} ·{" "}
              <Text color="cyan">/help</Text> for commands
            </Text>
          </Box>
        </Box>
      </Box>

      <Text dimColor>
        {"\n"}Welcome to Vanta. Type your message or <Text color="cyan">/help</Text> for commands.
      </Text>
    </Box>
  );
}
