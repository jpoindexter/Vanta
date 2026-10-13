/**
 * The line editor behind the approval-gated terminal. There is no shell and no pty: keystrokes are collected
 * into a line here, and a finished line is a command that must be approved before it runs. Escape sequences
 * (arrow keys, bracketed paste markers) are ignored, not interpreted.
 */

export const MAX_LINE = 4000;
const ESC = "\u001b";
const CSI_FINAL = /[@-~]/;

export interface LineEditorState {
  line: string;
}

export interface FeedResult {
  /** Text to echo back to the terminal. */
  echo: string;
  /** The user pressed Ctrl-D on an empty line. */
  eof: boolean;
  /** The user pressed Ctrl-C. */
  interrupt: boolean;
  state: LineEditorState;
  /** Finished lines, in order. A blank line is the empty string. */
  submitted: string[];
}

/** Skip one escape sequence starting at `index`; returns the index of its last character. */
function skipEscape(data: string, index: number): number {
  if (data[index + 1] !== "[") {
    return Math.min(index + 1, data.length - 1);
  }

  let end = index + 2;

  while (end < data.length && !CSI_FINAL.test(data[end] as string)) {
    end += 1;
  }

  return Math.min(end, data.length - 1);
}

const isPrintable = (char: string): boolean => char >= " " && char !== "\u007f";

interface Accumulator {
  echo: string;
  eof: boolean;
  interrupt: boolean;
  line: string;
  submitted: string[];
}

function backspace(acc: Accumulator): void {
  if (acc.line.length > 0) {
    acc.line = acc.line.slice(0, -1);
    acc.echo += "\b \b";
  }
}

const CONTROL_KEYS: Record<string, (acc: Accumulator, prompt: string) => void> = {
  "\b": backspace,
  "\u0003": acc => {
    acc.echo += "^C\r\n";
    acc.line = "";
    acc.interrupt = true;
  },
  "\u0004": acc => {
    acc.eof = acc.eof || acc.line.length === 0;
  },
  "\u0015": (acc, prompt) => {
    acc.line = "";
    acc.echo += `\r${ESC}[2K${prompt}`;
  },
  "\u007f": backspace
};

/** Handle the character at `index`; returns the index of the last character it consumed. */
function step(acc: Accumulator, data: string, index: number, prompt: string): number {
  const char = data[index] as string;

  if (char === "\r" || char === "\n") {
    acc.submitted.push(acc.line.trim());
    acc.echo += "\r\n";
    acc.line = "";

    return char === "\r" && data[index + 1] === "\n" ? index + 1 : index;
  }

  if (char === ESC) {
    return skipEscape(data, index);
  }

  const control = CONTROL_KEYS[char];

  if (control) {
    control(acc, prompt);
  } else if (isPrintable(char) && acc.line.length < MAX_LINE) {
    acc.line += char;
    acc.echo += char;
  }

  return index;
}

/** Apply typed or pasted input to the line being edited. `prompt` is what a cleared line is redrawn with. */
export function feedInput(start: LineEditorState, data: string, prompt: string): FeedResult {
  const acc: Accumulator = { echo: "", eof: false, interrupt: false, line: start.line, submitted: [] };

  for (let index = 0; index < data.length; index += 1) {
    index = step(acc, data, index, prompt);
  }

  return { echo: acc.echo, eof: acc.eof, interrupt: acc.interrupt, state: { line: acc.line }, submitted: acc.submitted };
}

const ANSI = new RegExp(`${ESC}(?:\\[[0-9;?]*[ -/]*[@-~]|\\][^\\u0007${ESC}]*(?:\\u0007|${ESC}\\\\)|[@-Z\\\\-_])`, "g");
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Command output is untrusted text: no escape sequences, no control characters, CRLF line ends, capped. */
export function sanitizeOutput(text: string, cap: number): string {
  const clean = text.replace(ANSI, "").replace(/\r(?!\n)/g, "\n").replace(CONTROL, "").replace(/\r?\n/g, "\r\n");

  return clean.length > cap ? `${clean.slice(0, cap)}\r\n[output cut at ${cap} characters]` : clean;
}
