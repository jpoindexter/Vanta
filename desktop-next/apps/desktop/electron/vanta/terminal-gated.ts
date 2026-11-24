import { z } from "zod";

import { CH } from "./channels";
import type { IpcLike } from "./native-handlers";
import { feedInput, type LineEditorState, sanitizeOutput } from "./terminal-line";
import type { NativeActionTarget } from "./native-action-target";

export const MAX_TERMINALS_PER_WINDOW = 8;
export const MAX_QUEUED_COMMANDS = 20;
export const MAX_OUTPUT_CHARS = 200_000;
export const COMMAND_TIMEOUT_MS = 600_000;
export const SHELL_LABEL = "vanta (each command needs approval)";

const DIM = "\u001b[2m";
const RED = "\u001b[31m";
const GREEN = "\u001b[32m";
const RESET = "\u001b[0m";

const startSchema = z.object({ cols: z.number().optional(), cwd: z.unknown().optional(), rows: z.number().optional() }).passthrough();
const writeSchema = z.string().max(100_000);

export interface CommandOutcome {
  ok: boolean;
  output: string;
}

export interface Sink {
  id: number;
  isDestroyed: () => boolean;
  once: (event: "destroyed", listener: () => void) => unknown;
  send: (channel: string, ...args: unknown[]) => void;
}

export interface TerminalDeps {
  /** The chat client whose open event stream will show the approval card for this window, if any. */
  clientFor: (sink: Sink) => NativeActionTarget | undefined;
  ipc: IpcLike;
  projectName: () => string;
  projectRoot: () => string;
  /** Run one command through the Vanta server's terminal route: the kernel check, the approval card and the sandbox. */
  run: (command: string, target: NativeActionTarget) => Promise<CommandOutcome>;
}

class GatedTerminal {
  private editor: LineEditorState = { line: "" };
  private readonly queue: { command: string; target?: NativeActionTarget }[] = [];
  private running = false;
  private closed = false;

  constructor(
    readonly id: string,
    private readonly sink: Sink,
    private readonly deps: TerminalDeps,
    private readonly onExit: () => void
  ) {
    this.emit(`${DIM}Vanta terminal. Every command you run here asks for approval first, one at a time.\r\nPrograms that need a live terminal (vim, ssh, top) are not available.${RESET}\r\n${this.prompt()}`);
  }

  prompt = (): string => `${GREEN}${this.deps.projectName()}${RESET} $ `;

  write(data: string): void {
    if (this.closed) {
      return;
    }

    const fed = feedInput(this.editor, data, this.prompt());

    this.editor = fed.state;
    this.emit(fed.echo);

    if (fed.interrupt) {
      this.emit(this.running ? `${DIM}(still waiting on the last command; it can't be stopped from here)${RESET}\r\n` : this.prompt());
    }

    if (fed.eof) {
      this.exit();

      return;
    }

    fed.submitted.slice(0, MAX_QUEUED_COMMANDS - this.queue.length).forEach(command => this.enqueue(command));
    void this.pump();
  }

  private enqueue(command: string): void {
    try {
      this.queue.push({ command, target: this.deps.clientFor(this.sink) });
    } catch (error) {
      this.emit(`${RED}${error instanceof Error ? error.message : String(error)}${RESET}\r\n${this.prompt()}`);
    }
  }

  dispose(): void {
    this.closed = true;
  }

  private emit(text: string): void {
    if (text && !this.closed && !this.sink.isDestroyed()) {
      this.sink.send(CH.terminalData, this.id, text);
    }
  }

  private exit(): void {
    this.emit("logout\r\n");
    this.closed = true;

    if (!this.sink.isDestroyed()) {
      this.sink.send(CH.terminalExit, this.id, { code: 0, signal: null });
    }

    this.onExit();
  }

  private builtin(command: string): boolean {
    if (command === "") {
      this.emit(this.prompt());
    } else if (command === "clear") {
      this.emit(`\u001b[2J\u001b[H${this.prompt()}`);
    } else if (command === "exit" || command === "logout") {
      this.exit();
    } else if (/^cd(\s|$)/.test(command)) {
      this.emit(`${DIM}cd does nothing here: every command runs in ${this.deps.projectRoot()}.${RESET}\r\n${this.prompt()}`);
    } else {
      return false;
    }

    return true;
  }

  private async pump(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      for (let item = this.queue.shift(); item !== undefined && !this.closed; item = this.queue.shift()) {
        if (!this.builtin(item.command)) {
          await this.execute(item.command, item.target);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async execute(command: string, target?: NativeActionTarget): Promise<void> {
    if (!target) {
      this.emit(`${RED}Open a chat first: the approval card for this command appears there.${RESET}\r\n${this.prompt()}`);

      return;
    }

    this.emit(`${DIM}waiting for approval…${RESET}\r\n`);

    try {
      const outcome = await this.deps.run(command, target);
      const body = sanitizeOutput(outcome.output, MAX_OUTPUT_CHARS);

      this.emit(`${outcome.ok ? "" : RED}${body}${outcome.ok ? "" : RESET}${body && !body.endsWith("\r\n") ? "\r\n" : ""}${this.prompt()}`);
    } catch (error) {
      this.emit(`${RED}${error instanceof Error ? error.message : String(error)}${RESET}\r\n${this.prompt()}`);
    }
  }
}

/**
 * Terminal panes without a pty. A line you type is one command, and it goes to the Vanta server's terminal
 * route, so the same kernel check, approval card and sandbox as the agent's own commands apply to every one.
 */
export class GatedTerminals {
  private readonly terminals = new Map<string, { owner: Sink; terminal: GatedTerminal }>();
  private readonly hooked = new WeakSet<object>();
  private counter = 0;

  constructor(private readonly deps: TerminalDeps) {
    const { ipc } = deps;

    ipc.handle(CH.terminalStart, (event, raw: unknown) => this.start(event.sender as Sink, raw));
    ipc.handle(CH.terminalWrite, (event, id: unknown, data: unknown) => this.write(event, id, data));
    ipc.handle(CH.terminalResize, (event, id: unknown) => Boolean(this.own(event, id)));
    ipc.handle(CH.terminalAttach, (event, id: unknown) => Boolean(this.own(event, id)));
    ipc.handle(CH.terminalCwd, (event, id: unknown) => (this.own(event, id) ? deps.projectRoot() : null));
    ipc.handle(CH.terminalDispose, (event, id: unknown) => (this.own(event, id) ? this.dispose(id as string) : false));
  }

  count = (): number => this.terminals.size;

  private own(event: { sender: unknown }, id: unknown) {
    const entry = typeof id === "string" ? this.terminals.get(id) : undefined;

    return entry?.owner === (event.sender as Sink) ? entry : undefined;
  }

  private dispose(id: string): boolean {
    this.terminals.get(id)?.terminal.dispose();

    return this.terminals.delete(id);
  }

  // One listener per window, however many terminals it holds: an EventEmitter warns past ten.
  private hook(owner: Sink): void {
    if (!this.hooked.has(owner)) {
      this.hooked.add(owner);
      owner.once("destroyed", () => [...this.terminals].forEach(([id, entry]) => entry.owner === owner && this.dispose(id)));
    }
  }

  private start(owner: Sink, raw: unknown) {
    const open = [...this.terminals.values()].filter(entry => entry.owner === owner).length;

    if (!startSchema.safeParse(raw ?? {}).success || open >= MAX_TERMINALS_PER_WINDOW) {
      throw new Error("Too many terminals are open. Close one and try again.");
    }

    this.hook(owner);
    this.counter += 1;
    const id = `vt${this.counter}`;
    // The pane may ask for a folder; every command runs in the project, so the answer is always the project.
    const terminal = new GatedTerminal(id, owner, this.deps, () => this.dispose(id));

    this.terminals.set(id, { owner, terminal });

    return { cwd: this.deps.projectRoot(), id, shell: SHELL_LABEL };
  }

  private write(event: { sender: unknown }, id: unknown, data: unknown): boolean {
    const entry = this.own(event, id);
    const text = writeSchema.safeParse(data);

    if (!entry || !text.success) {
      return false;
    }

    entry.terminal.write(text.data);

    return true;
  }
}

export const registerGatedTerminals = (deps: TerminalDeps): GatedTerminals => new GatedTerminals(deps);
