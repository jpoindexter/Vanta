import { readFile, writeFile } from "node:fs/promises";
import { totalmem } from "node:os";
import { createRuntimeProfile, runtimeProfileLaunchContract, type CreateRuntimeProfileInput, type RuntimeProfileHost } from "../runtime-engine/profile-contract.js";
import {
  cloneRuntimeProfile,
  createStoredRuntimeProfile,
  exportRuntimeProfile,
  importRuntimeProfile,
  listRuntimeProfiles,
  readRuntimeProfile,
  readSelectedRuntimeProfile,
  selectRuntimeProfile,
} from "../runtime-engine/profile-store.js";
import { RuntimeEngineBackendSchema } from "../runtime-engine/types.js";

type RuntimeProfileCommandDeps = { log?: (line: string) => void; host?: () => RuntimeProfileHost };
type Log = (line: string) => void;

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function flags(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index++) if (args[index] === name && args[index + 1] !== undefined) values.push(args[index + 1]!);
  return values;
}

function integerFlag(args: string[], name: string, fallback?: number): number | undefined {
  const value = flag(args, name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function usage(log: Log, advanced = false): number {
  log("Usage: vanta local-model profiles list|show|create|clone|validate|select|export|import");
  log("Required: create --id <id> --name <name> --model <path> --model-bytes <n> --available-memory <n>");
  log("Defaults: --backend llama_cpp --host 127.0.0.1 --port 8129 --context 8192 --policy ask");
  if (advanced) {
    log("Advanced: --threads --gpu-layers --batch-size --parallel --flash-attention on|off");
    log("          --env NAME=value|secret://reference --extra-arg <--flag[=value]> --review-unknown");
    log("          --review-remote-bind --review-contract-only --platforms <csv> --architectures <csv>");
  } else log("Advanced controls: add --advanced to disclose performance, environment, compatibility, and reviewed flags.");
  return 1;
}

function parseEnvironment(values: string[]) {
  return values.map((raw) => {
    const index = raw.indexOf("=");
    if (index < 1) throw new Error(`invalid --env value: ${raw}`);
    const name = raw.slice(0, index); const value = raw.slice(index + 1);
    return value.startsWith("secret://") ? { name, secretRef: value } : { name, value };
  });
}

function parseExtraArgs(values: string[], reviewed: boolean) {
  return values.map((raw) => {
    const index = raw.indexOf("=");
    return index < 0 ? { flag: raw, reviewed } : { flag: raw.slice(0, index), value: raw.slice(index + 1), reviewed };
  });
}

function csv(value: string | undefined): string[] | undefined {
  return value?.split(",").map((item) => item.trim()).filter(Boolean);
}

function localHost(args: string[], deps: RuntimeProfileCommandDeps): RuntimeProfileHost {
  const detected = deps.host?.() ?? { platform: process.platform, architecture: process.arch, memoryBytes: totalmem() };
  return {
    platform: flag(args, "--platform") ?? detected.platform,
    architecture: flag(args, "--arch") ?? detected.architecture,
    memoryBytes: integerFlag(args, "--memory", detected.memoryBytes) ?? detected.memoryBytes,
  };
}

function requiredFlag(args: string[], name: string): string {
  const value = flag(args, name);
  if (!value) throw new Error(`required option missing: ${name}`);
  return value;
}

function createCompatibility(args: string[]): CreateRuntimeProfileInput["compatibility"] {
  const platforms = csv(flag(args, "--platforms"));
  const architectures = csv(flag(args, "--architectures"));
  return platforms || architectures ? { platforms: platforms ?? [process.platform], architectures: architectures ?? [process.arch] } : undefined;
}

function createPerformance(args: string[]): CreateRuntimeProfileInput["performance"] {
  const flash = flag(args, "--flash-attention");
  return {
    threads: integerFlag(args, "--threads"), gpuLayers: integerFlag(args, "--gpu-layers"),
    batchSize: integerFlag(args, "--batch-size"), parallel: integerFlag(args, "--parallel"),
    ...(flash === undefined ? {} : { flashAttention: flash === "on" }),
  };
}

function createInput(args: string[]): CreateRuntimeProfileInput {
  const compatibility = createCompatibility(args);
  return {
    id: requiredFlag(args, "--id"), name: requiredFlag(args, "--name"), modelPath: requiredFlag(args, "--model"),
    backend: RuntimeEngineBackendSchema.parse(flag(args, "--backend") ?? "llama_cpp"),
    modelBytes: integerFlag(args, "--model-bytes") ?? 0, availableMemoryBytes: integerFlag(args, "--available-memory") ?? 0,
    host: flag(args, "--host"), port: integerFlag(args, "--port"), contextTokens: integerFlag(args, "--context"), performance: createPerformance(args),
    environment: parseEnvironment(flags(args, "--env")), extraArgs: parseExtraArgs(flags(args, "--extra-arg"), args.includes("--review-unknown")),
    policyScope: (flag(args, "--policy") ?? "ask") as CreateRuntimeProfileInput["policyScope"], compatibility,
    reviewedRemoteBind: args.includes("--review-remote-bind"), reviewedContractOnly: args.includes("--review-contract-only"),
  };
}

async function createCommand(root: string, args: string[], log: Log): Promise<number> {
  if (args.includes("--advanced")) usage(log, true);
  if (args.includes("--advanced") && !flag(args, "--id")) return 1;
  const profile = createRuntimeProfile(createInput(args));
  await createStoredRuntimeProfile(root, profile);
  log(`created runtime profile ${profile.id} · advanced fields remain hidden until requested`);
  return 0;
}

async function listCommand(root: string, log: Log, json: boolean): Promise<number> {
  const [profiles, selected] = await Promise.all([listRuntimeProfiles(root), readSelectedRuntimeProfile(root)]);
  if (json) log(JSON.stringify({ selected: selected?.id ?? null, profiles }));
  else log(profiles.length ? profiles.map((profile) => `${profile.id === selected?.id ? "*" : " "} ${profile.id} · ${profile.backend} · ${profile.name}`).join("\n") : "no runtime profiles");
  return 0;
}

async function validateCommand(root: string, args: string[], deps: RuntimeProfileCommandDeps, log: Log): Promise<number> {
  const id = args.find((arg) => !arg.startsWith("--"));
  if (!id) return usage(log);
  const contract = runtimeProfileLaunchContract(await readRuntimeProfile(root, id), localHost(args, deps));
  const output = { id, valid: contract.validation.valid, compatible: contract.validation.compatible, resource: contract.preview.resource, command: [contract.preview.command, ...contract.preview.args], issues: contract.validation.issues, roundTrip: contract.roundTrip };
  log(args.includes("--json") ? JSON.stringify(output) : `${id}: ${output.valid ? "valid" : "needs attention"} · ${output.resource.fits ? "fits" : "does not fit"} · ${output.issues.map((item) => item.message).join("; ") || "command round-trip verified"}`);
  return output.valid && output.roundTrip ? 0 : 1;
}

async function selectCommand(root: string, args: string[], deps: RuntimeProfileCommandDeps, log: Log): Promise<number> {
  const id = args.find((arg) => !arg.startsWith("--"));
  if (!id) return usage(log);
  const contract = runtimeProfileLaunchContract(await readRuntimeProfile(root, id), localHost(args, deps));
  if (!contract.validation.valid || !contract.roundTrip) {
    const recovery = contract.validation.issues.map((issue) => issue.recovery).join(" ") || "Regenerate the profile command before selecting it.";
    log(`Runtime profile ${id} cannot be selected on this host. ${recovery}`);
    return 1;
  }
  const profile = await selectRuntimeProfile(root, id);
  log(`selected runtime profile ${profile.id}`);
  return 0;
}

type CommandContext = { root: string; args: string[]; deps: RuntimeProfileCommandDeps; log: Log };
type CommandHandler = (context: CommandContext) => Promise<number>;

const COMMANDS: Record<string, CommandHandler> = {
  list: ({ root, args, log }) => listCommand(root, log, args.includes("--json")),
  create: ({ root, args, log }) => createCommand(root, args, log),
  validate: ({ root, args, deps, log }) => validateCommand(root, args, deps, log),
  show: async ({ root, args, log }) => { const profile = await readRuntimeProfile(root, args[0] ?? ""); log(JSON.stringify(profile, null, args.includes("--json") ? 0 : 2)); return 0; },
  clone: async ({ root, args, log }) => { const profile = await cloneRuntimeProfile(root, { sourceId: args[0] ?? "", id: args[1] ?? "", name: flag(args, "--name") ?? args[1] ?? "" }); log(`cloned runtime profile ${profile.id} from ${profile.clonedFrom}`); return 0; },
  select: ({ root, args, deps, log }) => selectCommand(root, args, deps, log),
  export: async ({ root, args, log }) => {
    const content = await exportRuntimeProfile(root, args[0] ?? ""); const output = flag(args, "--output");
    if (output) { await writeFile(output, content, { encoding: "utf8", mode: 0o600 }); log(`exported runtime profile ${args[0]} to ${output}`); } else log(content.trimEnd());
    return 0;
  },
  import: async ({ root, args, log }) => { const path = args[0]; if (!path) return usage(log); const profile = await importRuntimeProfile(root, JSON.parse(await readFile(path, "utf8")), args.includes("--replace")); log(`imported runtime profile ${profile.id}`); return 0; },
};

export async function runRuntimeProfileCommand(root: string, rest: string[], deps: RuntimeProfileCommandDeps = {}): Promise<number> {
  const log = deps.log ?? console.log; const [command = "list", ...args] = rest;
  const handler = COMMANDS[command];
  if (!handler) return usage(log, args.includes("--advanced"));
  try { return await handler({ root, args, deps, log }); }
  catch (error) { log(`Runtime profile ${command} failed: ${error instanceof Error ? error.message : String(error)}`); return 1; }
}
