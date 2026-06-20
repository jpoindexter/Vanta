import { z } from "zod";

// Named SSH connection profiles — the run-anywhere foundation: address a host the
// user controls by name (a $5 VPS, a home server) instead of repeating
// user@host:port flags. shell_cmd runs a command on a named host; `vanta ssh
// <name>` opens an interactive shell. Pure: resolution + ssh-arg construction
// only; the kernel still gates every command that runs over the connection.

// ssh -o keys that run a LOCAL command (bypassing kernel command assessment).
// A profile must never set these — they turn a remote-connection profile into
// arbitrary local code execution. Compared case-insensitively against the key
// before the first `=`.
const LOCAL_EXEC_OPTION_KEYS = new Set([
  "proxycommand",
  "localcommand",
  "permitlocalcommand",
  "proxyjump",
  "proxyusefdpass",
]);

/** The `-o key=value` key, lower-cased. Pure. */
function optionKey(opt: string): string {
  return (opt.split("=", 1)[0] ?? "").trim().toLowerCase();
}

/** True if an `-o` option would enable local command execution. Pure. */
function isLocalExecOption(opt: string): boolean {
  return LOCAL_EXEC_OPTION_KEYS.has(optionKey(opt));
}

// host/user must not start with `-`, or ssh parses them as flags (e.g.
// `-oProxyCommand=...`), running a local command before any remote connection.
const noLeadingDash = (s: string) => !s.startsWith("-");

export const SshProfileSchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1).refine(noLeadingDash, "host must not start with '-'"),
  user: z.string().min(1).refine(noLeadingDash, "user must not start with '-'").optional(),
  port: z.number().int().positive().max(65535).optional(),
  /** Path to a private key (ssh -i). */
  identityFile: z.string().min(1).optional(),
  /** Extra `ssh -o` options, e.g. "StrictHostKeyChecking=accept-new".
   *  Local-exec options (ProxyCommand/LocalCommand/etc.) are rejected. */
  options: z.array(
    z.string().min(1).refine((o) => !isLocalExecOption(o), {
      message: "option enables local command execution and is not allowed",
    }),
  ).optional(),
});
export type SshProfile = z.infer<typeof SshProfileSchema>;

/** All configured profile names (for error messages + `vanta ssh` with no arg). */
export function profileNames(profiles: SshProfile[] | undefined): string[] {
  return (profiles ?? []).map((p) => p.name);
}

/** Find a profile by name. Pure. */
export function resolveSshProfile(name: string, profiles: SshProfile[] | undefined): SshProfile | null {
  return (profiles ?? []).find((p) => p.name === name) ?? null;
}

/** The ssh destination: `user@host` when a user is set, else `host`. Pure. */
export function sshTarget(profile: SshProfile): string {
  return profile.user ? `${profile.user}@${profile.host}` : profile.host;
}

/**
 * Build the argv for the `ssh` binary. With a remoteCommand the connection runs
 * that command and exits; without one it opens an interactive shell. Pure.
 */
export function buildSshArgs(profile: SshProfile, remoteCommand?: string): string[] {
  const args: string[] = [];
  if (profile.port) args.push("-p", String(profile.port));
  if (profile.identityFile) args.push("-i", profile.identityFile);
  for (const opt of profile.options ?? []) args.push("-o", opt);
  // `--` terminates option parsing: the target and command can never be read as
  // ssh flags even if they slip past schema validation.
  args.push("--", sshTarget(profile));
  if (remoteCommand) args.push(remoteCommand);
  return args;
}

/**
 * An explicit remote address (`user@host` or `host:port`) — as opposed to a
 * bare word, which is more likely a mistyped profile name than a hostname we
 * should silently dial. Pure.
 */
export function looksLikeRemoteTarget(s: string): boolean {
  const t = s.trim();
  return t.includes("@") || /:\d+$/.test(t);
}

/**
 * Parse a `user@host`, `host`, `user@host:port`, or `host:port` string into an
 * ad-hoc profile (name = the raw target). Returns null when the result wouldn't
 * be a valid profile (e.g. an injection-shaped leading-dash host). Pure.
 */
export function parseSshTarget(target: string): SshProfile | null {
  const raw = target.trim();
  if (!raw) return null;
  const at = raw.lastIndexOf("@");
  const user = at >= 0 ? raw.slice(0, at) : undefined;
  let host = at >= 0 ? raw.slice(at + 1) : raw;
  let port: number | undefined;
  const colon = host.lastIndexOf(":");
  if (colon > 0 && /^\d+$/.test(host.slice(colon + 1))) {
    port = Number(host.slice(colon + 1));
    host = host.slice(0, colon);
  }
  const parsed = SshProfileSchema.safeParse({
    name: raw, host,
    ...(user ? { user } : {}),
    ...(port ? { port } : {}),
  });
  return parsed.success ? parsed.data : null;
}

/**
 * Resolve an ssh argument to a profile: a configured profile by name first, then
 * — only for an explicit remote address — a parsed `user@host` target. A bare
 * unconfigured word returns null (treat it as a mistyped profile name, never an
 * implicit host to dial). Pure (the caller supplies the configured profiles).
 */
export function resolveSshTarget(arg: string, profiles: SshProfile[] | undefined): SshProfile | null {
  return resolveSshProfile(arg, profiles) ?? (looksLikeRemoteTarget(arg) ? parseSshTarget(arg) : null);
}
