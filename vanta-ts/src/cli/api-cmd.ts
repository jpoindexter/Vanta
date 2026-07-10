import { resolveVantaHome } from "../store/home.js";
import { issuePublicApiToken, listPublicApiTokens, revokePublicApiToken } from "../public-api/auth.js";

const USAGE = "usage: vanta api serve [port] | token create <name> | token list | token revoke <id>";

export async function runApiCommand(repoRoot: string, rest: string[], log: (line: string) => void = console.log): Promise<number | void> {
  const sub = rest[0];
  if (sub === "serve") return serve(repoRoot, rest.slice(1));
  if (sub === "token") return tokenCommand(rest.slice(1), log);
  log(USAGE);
  return 1;
}

async function serve(repoRoot: string, rest: string[]): Promise<void> {
  const port = parsePort(rest[0]);
  const { servePublicApi } = await import("../public-api/server.js");
  await servePublicApi(repoRoot, port);
}

async function tokenCommand(rest: string[], log: (line: string) => void): Promise<number> {
  const home = resolveVantaHome();
  const sub = rest[0] ?? "list";
  if (sub === "create") {
    const issued = await issuePublicApiToken(home, rest.slice(1).join(" "));
    log(`created ${issued.record.id} (${issued.record.name})`);
    log(`token ${issued.token}`);
    log("store this token now; Vanta only keeps its hash");
    return 0;
  }
  if (sub === "list") {
    const records = await listPublicApiTokens(home);
    log(records.length ? records.map(formatToken).join("\n") : "no public API tokens");
    return 0;
  }
  if (sub === "revoke") {
    const record = rest[1] ? await revokePublicApiToken(home, rest[1]) : null;
    if (!record) { log(rest[1] ? `token not found or already revoked: ${rest[1]}` : USAGE); return 1; }
    log(`revoked ${record.id} (${record.name})`);
    return 0;
  }
  log(USAGE);
  return 1;
}

function formatToken(record: Awaited<ReturnType<typeof listPublicApiTokens>>[number]): string {
  const status = record.revokedAt ? `revoked ${record.revokedAt}` : `active${record.lastUsedAt ? ` · last used ${record.lastUsedAt}` : ""}`;
  return `${record.id}  ${record.name}  ${status}`;
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? 7791);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error(`invalid API port: ${value ?? ""}`);
  return port;
}
