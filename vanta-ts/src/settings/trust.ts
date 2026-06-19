import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { z } from "zod";

// Project-scoped trust store. First time a project is opened we ask the operator
// to trust it before its CLAUDE.md/VANTA.md context loads; first time an MCP
// server is mounted we ask before its tools register. Decisions persist here so
// the prompt only fires once per project / per server. This ADDS a gate; it
// never bypasses the kernel — an MCP tool stays kernel-gated after it mounts.
//
// Persisted at <projectRoot>/.vanta/trust.json (project-scoped, gitignorable).

const TrustStateSchema = z
  .object({
    version: z.literal(1),
    /** Whether the project's context files are trusted to load. */
    project: z.boolean().optional(),
    /** MCP server name → trusted/denied decision. */
    mcp: z.record(z.boolean()).optional(),
  })
  .strict();

export type TrustState = z.infer<typeof TrustStateSchema>;

const EMPTY: TrustState = { version: 1 };

function trustPath(projectRoot: string): string {
  return join(projectRoot, ".vanta", "trust.json");
}

/** Read the project's trust state. Missing/corrupt → empty (nothing trusted yet). */
export async function readTrust(projectRoot: string): Promise<TrustState> {
  try {
    const parsed = TrustStateSchema.safeParse(JSON.parse(await readFile(trustPath(projectRoot), "utf8")));
    return parsed.success ? parsed.data : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

async function writeTrust(projectRoot: string, state: TrustState): Promise<void> {
  const path = trustPath(projectRoot);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2) + "\n", "utf8");
}

/** True only when the project's context has been explicitly trusted. */
export async function isProjectTrusted(projectRoot: string): Promise<boolean> {
  return (await readTrust(projectRoot)).project === true;
}

/** Persist a project trust/deny decision. */
export async function trustProject(projectRoot: string, trusted: boolean): Promise<void> {
  const state = await readTrust(projectRoot);
  await writeTrust(projectRoot, { ...state, project: trusted });
}

/** Whether a decision has already been recorded for the project (trust or deny). */
export async function hasProjectDecision(projectRoot: string): Promise<boolean> {
  return (await readTrust(projectRoot)).project !== undefined;
}

/** True only when the named MCP server has been explicitly trusted. */
export async function isMcpTrusted(projectRoot: string, server: string): Promise<boolean> {
  return (await readTrust(projectRoot)).mcp?.[server] === true;
}

/** Persist an MCP-server trust/deny decision. */
export async function trustMcp(projectRoot: string, server: string, trusted: boolean): Promise<void> {
  const state = await readTrust(projectRoot);
  await writeTrust(projectRoot, { ...state, mcp: { ...state.mcp, [server]: trusted } });
}

/** Whether a decision has already been recorded for the named MCP server. */
export async function hasMcpDecision(projectRoot: string, server: string): Promise<boolean> {
  return (await readTrust(projectRoot)).mcp?.[server] !== undefined;
}

export { trustPath };
