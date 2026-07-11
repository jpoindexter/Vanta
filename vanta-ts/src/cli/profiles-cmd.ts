import {
  archiveProfile,
  cloneProfile,
  createProfile,
  listProfileInbox,
  listProfiles,
  switchProfile,
  setProfileTools,
  targetProfile,
} from "../profiles/store.js";

export type ProfilesCommandDeps = {
  env?: NodeJS.ProcessEnv;
  log?: (line: string) => void;
};

function usage(log: (line: string) => void): number {
  log("Usage: vanta profiles [list|create <name> [--provider <id> --model <id> --tools <a,b>]|tools <name> --allow <a,b>|clone <source> <name>|switch <name>|archive <name>|target <name> <instruction>|inbox <name>]");
  return 1;
}

function flag(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
}

type HandlerContext = { args: string[]; env: NodeJS.ProcessEnv; log: (line: string) => void };
type Handler = (ctx: HandlerContext) => Promise<number>;

async function list(env: NodeJS.ProcessEnv, log: (line: string) => void): Promise<number> {
  const profiles = await listProfiles(env);
  log(`Profiles — ${profiles.length}`);
  if (profiles.length === 0) log("(no specialist profiles; create one with `vanta profiles create <name>`)");
  for (const profile of profiles) {
    const status = profile.active ? "active" : profile.status;
    const model = [profile.provider, profile.model].filter(Boolean).join("/") || "inherits model";
    log(`${profile.id} · ${status} · ${model} · last ${profile.lastWorkAt ?? "never"}`);
  }
  return 0;
}

const handlers: Record<string, Handler> = {
  list: async ({ env, log }) => list(env, log),
  create: async ({ args, env, log }) => {
    if (!args[1]) return usage(log);
    const profile = await createProfile({ name: args[1], provider: flag(args, "--provider"), model: flag(args, "--model"), gatewayIdentity: flag(args, "--gateway-identity"), allowedTools: csv(flag(args, "--tools")) }, env);
    log(`created ${profile.id} · home ${profile.home}`);
    return 0;
  },
  tools: async ({ args, env, log }) => {
    if (!args[1] || flag(args, "--allow") === undefined) return usage(log);
    const profile = await setProfileTools(args[1], csv(flag(args, "--allow")) ?? [], env);
    log(`${profile.id} allowedTools: ${profile.allowedTools?.join(", ") || "(none)"}`);
    return 0;
  },
  clone: async ({ args, env, log }) => {
    if (!args[1] || !args[2]) return usage(log);
    const profile = await cloneProfile(args[1], args[2], env);
    log(`cloned ${args[1]} -> ${profile.id}`);
    return 0;
  },
  switch: async ({ args, env, log }) => {
    if (!args[1]) return usage(log);
    const profile = await switchProfile(args[1], env);
    log(`${profile.id} active on next Vanta start`);
    return 0;
  },
  archive: async ({ args, env, log }) => {
    if (!args[1]) return usage(log);
    const profile = await archiveProfile(args[1], env);
    log(`archived ${profile.id}`);
    return 0;
  },
  target: async ({ args, env, log }) => {
    if (!args[1] || !args[2]) return usage(log);
    const message = await targetProfile(args[1], args[2], env);
    log(`${message.id} queued for ${message.profileId}`);
    return 0;
  },
  inbox: async ({ args, env, log }) => {
    if (!args[1]) return usage(log);
    const messages = await listProfileInbox(args[1], env);
    log(`Inbox — ${messages.length}`);
    for (const message of messages) log(`${message.id} · ${message.status} · ${message.instruction}`);
    return 0;
  },
};

function csv(value: string | undefined): string[] | undefined {
  return value === undefined ? undefined : value.split(",").map((item) => item.trim()).filter(Boolean);
}

handlers.send = handlers.target as Handler;

export async function runProfilesCommand(rest: string[], deps: ProfilesCommandDeps = {}): Promise<number> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? console.log;
  const command = rest[0] ?? "list";
  try {
    const handler = handlers[command];
    return handler ? handler({ args: rest, env, log }) : usage(log);
  } catch (error) {
    log(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
