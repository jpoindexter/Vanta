import {
  grantAuthority,
  revokeAuthority,
  readGrants,
  writeGrants,
  readAuditLog,
  type AuthorityClass,
  type AuthorityGrant,
  type DelegatedAuditRecord,
} from "../cofounder/delegated-authority.js";

// `vanta authority grant <delegator> <delegate> --spend <usd> | --write-scope <path>`
// / `list` / `revoke <id>`. An owner grants a manager bounded authority over an
// Ask-class approval class; the live kernel approval loop is NOT wired here
// (deferred follow-up — the kernel block floor is never delegated).
//
// Handlers are pure over injected deps so the whole surface is unit-tested
// without real I/O. NOT wired into cli/ops.ts + cli.ts (see dispatch_wiring).

export type AuthorityDeps = {
  readGrants: () => Promise<AuthorityGrant[]>;
  writeGrants: (list: AuthorityGrant[]) => Promise<void>;
  readAuditLog: () => Promise<DelegatedAuditRecord[]>;
  log: (line: string) => void;
  now?: () => Date;
};

const USAGE = [
  "usage:",
  "  vanta authority grant <delegator> <delegate> (--spend <usd> | --write-scope <path>)",
  "  vanta authority list",
  "  vanta authority revoke <grant-id>",
  "  vanta authority audit",
].join("\n");

/** Read the single value following a flag, or undefined. Pure. */
function oneFlag(rest: string[], flag: string): string | undefined {
  const i = rest.indexOf(flag);
  return i === -1 ? undefined : rest[i + 1];
}

export type GrantArgs = { delegator: string; delegate: string; class: AuthorityClass };

/**
 * Parse `vanta authority grant <delegator> <delegate> --spend N | --write-scope P`.
 * The two parties are the first two bare tokens; exactly one bound flag is
 * required. Pure — no I/O. Errors-as-values.
 */
export function parseGrantArgs(rest: string[]): { ok: true; value: GrantArgs } | { ok: false; error: string } {
  const delegator = positional(rest, 0);
  const delegate = positional(rest, 1);
  if (!delegator || !delegate) return { ok: false, error: "grant needs a <delegator> and a <delegate>" };

  const spendRaw = oneFlag(rest, "--spend");
  const scopeRaw = oneFlag(rest, "--write-scope");
  if (spendRaw !== undefined && scopeRaw !== undefined) {
    return { ok: false, error: "pass exactly one of --spend <usd> or --write-scope <path>" };
  }
  if (spendRaw !== undefined) {
    const maxUsd = Number(spendRaw);
    if (!(Number.isFinite(maxUsd) && maxUsd > 0)) {
      return { ok: false, error: `--spend must be a positive number, got "${spendRaw}"` };
    }
    return { ok: true, value: { delegator, delegate, class: { kind: "spend", maxUsd } } };
  }
  if (scopeRaw !== undefined && scopeRaw.trim().length > 0) {
    return { ok: true, value: { delegator, delegate, class: { kind: "writeScope", scope: scopeRaw } } };
  }
  return { ok: false, error: "grant needs a bound: --spend <usd> or --write-scope <path>" };
}

/** The Nth bare positional token (skips flags and flag values). Pure. */
function positional(rest: string[], n: number): string | undefined {
  const valueIdx = new Set<number>();
  rest.forEach((tok, i) => {
    if ((tok === "--spend" || tok === "--write-scope") && i + 1 < rest.length) valueIdx.add(i + 1);
  });
  const bare = rest.filter((tok, i) => !tok.startsWith("--") && !valueIdx.has(i));
  return bare[n];
}

/** Render one grant as a text line. Pure. */
export function formatGrant(g: AuthorityGrant): string {
  const bound = g.class.kind === "spend" ? `spend <= $${g.class.maxUsd}` : `write in ${g.class.scope}`;
  const state = g.active ? "active" : `revoked${g.revokedAt ? ` @ ${g.revokedAt}` : ""}`;
  return `${g.id} · ${g.delegator} → ${g.delegate} · ${bound} · ${state}`;
}

/** Render one audit record as a text line. Pure. */
export function formatAuditRecord(r: DelegatedAuditRecord): string {
  return `${r.at} · ${r.delegator} → ${r.delegate} · grant ${r.grantId} · ${r.action}`;
}

/** `authority grant` — create + persist a bounded grant. */
export async function handleGrant(args: GrantArgs, deps: AuthorityDeps): Promise<number> {
  const now = (deps.now ?? (() => new Date()))();
  const existing = await deps.readGrants();
  const result = grantAuthority(existing, args, now);
  if (!result.ok) {
    deps.log(result.error);
    return 1;
  }
  await deps.writeGrants([...existing, result.value]);
  deps.log(`granted ${formatGrant(result.value)}`);
  return 0;
}

/** `authority list` — every grant, active and revoked. */
export async function handleList(deps: AuthorityDeps): Promise<number> {
  const list = await deps.readGrants();
  if (list.length === 0) {
    deps.log("no authority grants — create one with: vanta authority grant <owner> <manager> --spend <usd>");
    return 0;
  }
  for (const g of list) deps.log(formatGrant(g));
  return 0;
}

/** `authority revoke <id>` — mark a grant inactive (kept for audit). */
export async function handleRevoke(id: string, deps: AuthorityDeps): Promise<number> {
  const now = (deps.now ?? (() => new Date()))();
  const result = revokeAuthority(await deps.readGrants(), id, now);
  if (!result.ok) {
    deps.log(result.error);
    return 1;
  }
  await deps.writeGrants(result.value);
  deps.log(`revoked ${id}`);
  return 0;
}

/** `authority audit` — the append-only delegated-decision log. */
export async function handleAudit(deps: AuthorityDeps): Promise<number> {
  const records = await deps.readAuditLog();
  if (records.length === 0) {
    deps.log("no delegated decisions recorded yet");
    return 0;
  }
  for (const r of records) deps.log(formatAuditRecord(r));
  return 0;
}

/** Dispatch a parsed `vanta authority <sub>` against injected deps. */
export async function handleAuthority(rest: string[], deps: AuthorityDeps): Promise<number> {
  const [sub, ...args] = rest;
  switch (sub) {
    case "grant": {
      const parsed = parseGrantArgs(args);
      if (!parsed.ok) {
        deps.log(`${parsed.error}\n${USAGE}`);
        return 1;
      }
      return handleGrant(parsed.value, deps);
    }
    case "list":
      return handleList(deps);
    case "revoke": {
      const id = args[0];
      if (id === undefined) {
        deps.log(`revoke needs a grant id\n${USAGE}`);
        return 1;
      }
      return handleRevoke(id, deps);
    }
    case "audit":
      return handleAudit(deps);
    default:
      deps.log(USAGE);
      return sub ? 1 : 0;
  }
}

/** Build live deps: grants + audit log in `~/.vanta`. */
export function liveAuthorityDeps(): AuthorityDeps {
  return {
    readGrants: () => readGrants(),
    writeGrants: (list) => writeGrants(list),
    readAuditLog: () => readAuditLog(),
    log: (line) => console.log(line),
  };
}

/** Entry point for wiring `vanta authority` into cli/ops.ts + cli.ts. */
export async function runAuthorityCommand(rest: string[]): Promise<number> {
  return handleAuthority(rest, liveAuthorityDeps());
}
