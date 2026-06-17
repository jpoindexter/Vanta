import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  CodeContextOptions,
  CodeIndexOptions,
  CodeIntelProvider,
  CodeIntelScope,
  CodeSearchOptions,
} from "./interface.js";

const execFileAsync = promisify(execFile);

/** Max bytes of CLI output to buffer — large contexts on big repos. */
const MAX_BUFFER = 16 * 1024 * 1024;

/**
 * The ONLY module in Vanta that knows the `codegraph` CLI exists. Everything
 * else depends on the {@link CodeIntelProvider} port. The architectural fitness
 * function enforces this: no file outside this one may exec `codegraph`.
 */
export class CodegraphProvider implements CodeIntelProvider {
  readonly id = "codegraph";
  /** The CLI binary name; overridable for tests / non-PATH installs. */
  constructor(private readonly bin = "codegraph") {}

  private async run(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync(this.bin, args, { maxBuffer: MAX_BUFFER });
    return stdout.trim();
  }

  /** `-p <path>` flag, appended only when a root is given. */
  private static path(opts?: CodeIntelScope): string[] {
    return opts?.root ? ["-p", opts.root] : [];
  }

  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync(this.bin, ["--version"]);
      return true;
    } catch {
      return false;
    }
  }

  async context(task: string, opts: CodeContextOptions = {}): Promise<string> {
    const args = ["context", task, ...CodegraphProvider.path(opts)];
    if (opts.maxNodes) args.push("-n", String(opts.maxNodes));
    if (opts.includeCode === false) args.push("--no-code");
    return this.run(args);
  }

  async search(query: string, opts: CodeSearchOptions = {}): Promise<string> {
    const args = ["query", query, ...CodegraphProvider.path(opts)];
    if (opts.kind) args.push("-k", opts.kind);
    if (opts.limit) args.push("-l", String(opts.limit));
    return this.run(args);
  }

  async affected(files: string[], opts: CodeIntelScope = {}): Promise<string> {
    return this.run(["affected", ...files, ...CodegraphProvider.path(opts)]);
  }

  async status(opts: CodeIntelScope = {}): Promise<string> {
    // `status` takes [path] positionally, not -p.
    return this.run(opts.root ? ["status", opts.root] : ["status"]);
  }

  async index(opts: CodeIndexOptions = {}): Promise<string> {
    const args = ["index", ...(opts.root ? [opts.root] : [])];
    if (opts.force) args.push("--force");
    return this.run(args);
  }

  async sync(opts: CodeIntelScope = {}): Promise<string> {
    return this.run(opts.root ? ["sync", opts.root] : ["sync"]);
  }
}
