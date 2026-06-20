/**
 * VANTA-DUMP-SYS-PROMPT: `--dump-system-prompt` assembles the full system
 * prompt, prints it to stdout, and exits 0 without starting a session.
 *
 * Two pure seams kept testable without a real prompt build or network:
 *  - `wantsDumpPrompt(argv)` — flag detection over raw args.
 *  - `runDumpPrompt(deps)` — orchestration over an injected builder + printer.
 * The live builder (`defaultDumpDeps`) wires `prepareRun` for the cwd repo.
 */
const DUMP_FLAG = "--dump-system-prompt";

/** True when the args contain `--dump-system-prompt`. Pure. */
export function wantsDumpPrompt(argv: string[]): boolean {
  return argv.includes(DUMP_FLAG);
}

/** Strip `--dump-system-prompt` from args. Pure (the rest stay untouched). */
export function stripDumpFlag(argv: string[]): string[] {
  return argv.filter((arg) => arg !== DUMP_FLAG);
}

export type DumpPromptDeps = {
  /** Assemble the full system prompt (live: prepareRun for the cwd repo). */
  buildPrompt: () => Promise<string>;
  /** Emit the assembled prompt (live: process.stdout / console.log). */
  print: (text: string) => void;
};

/**
 * Build the prompt via the injected builder, print it, and return exit 0.
 * Never throws across the boundary — a builder failure prints the message and
 * returns exit code 1.
 */
export async function runDumpPrompt(deps: DumpPromptDeps): Promise<number> {
  try {
    const prompt = await deps.buildPrompt();
    deps.print(prompt);
    return 0;
  } catch (err: unknown) {
    deps.print(`vanta: failed to build system prompt: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

/** Live deps: assemble the real prompt via prepareRun for `repoRoot`. */
export function defaultDumpDeps(repoRoot: string): DumpPromptDeps {
  return {
    buildPrompt: async () => {
      const { prepareRun } = await import("../session.js");
      const setup = await prepareRun(repoRoot, "interactive session");
      return setup.systemPrompt;
    },
    print: (text) => console.log(text),
  };
}
