import {
  validateKeybindings,
  writeKeybindingsTemplate,
  keybindingsPath,
} from "../ui/keybindings.js";

type KeybindingCmdDeps = {
  env: NodeJS.ProcessEnv;
  log: (line: string) => void;
};

async function runTemplate(rest: string[], deps: KeybindingCmdDeps): Promise<number> {
  const result = await writeKeybindingsTemplate(deps.env, { force: rest.includes("--force") });
  if (!result.ok) {
    deps.log(`keybindings template: ${result.error} (${result.path})`);
    return 1;
  }
  deps.log(`keybindings template written: ${result.path}`);
  return 0;
}

async function runDoctor(deps: KeybindingCmdDeps): Promise<number> {
  const report = await validateKeybindings(deps.env);
  if (!report.exists) {
    deps.log(`keybindings: no config yet (${report.path})`);
    deps.log("  create one with: vanta keybindings template");
    return 0;
  }
  if (report.errors.length === 0 && report.warnings.length === 0) {
    deps.log(`keybindings: ok (${report.bindings.length} binding(s), ${report.path})`);
    return 0;
  }
  for (const err of report.errors) deps.log(`keybindings error: ${err}`);
  for (const warning of report.warnings) deps.log(warning);
  return 1;
}

export async function runKeybindingsCommand(
  rest: string[],
  env: NodeJS.ProcessEnv = process.env,
  log: (line: string) => void = console.log,
): Promise<number> {
  const sub = rest[0] ?? "doctor";
  const deps = { env, log };
  if (sub === "template") return runTemplate(rest, deps);
  if (sub === "path") {
    log(keybindingsPath(env));
    return 0;
  }
  if (sub === "doctor") return runDoctor(deps);
  log("usage: vanta keybindings [doctor|template [--force]|path]");
  return 1;
}
