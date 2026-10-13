import type { VantaTransport } from "../../../shared/src/vanta";

import { COMMAND_TIMEOUT_MS, type CommandOutcome } from "./terminal-gated";

/**
 * Runs one command through the Vanta server's terminal route: the kernel's decision, the approval card in the
 * chat named by `clientId`, and the OS sandbox. This is the only way the shell asks for a command to be run.
 */
export function createGatedRunner(transport: VantaTransport) {
  return async (command: string, clientId: string): Promise<CommandOutcome> => {
    const result = await transport.request({
      body: { command },
      clientId,
      method: "POST",
      path: "/api/terminal",
      timeoutMs: COMMAND_TIMEOUT_MS
    });

    const data = result.data as { error?: unknown; ok?: unknown; output?: unknown } | null;

    if (!result.ok) {
      return { ok: false, output: String(data?.error ?? `The Vanta server answered ${result.status || "nothing"}.`) };
    }

    return { ok: data?.ok === true, output: typeof data?.output === "string" ? data.output : "" };
  };
}

export type GatedRunner = ReturnType<typeof createGatedRunner>;

/** macOS prints these when git runs inside the sandbox; they are not why a command failed. */
const NOISE = [/^git: (error|warning): unable to (read SDK settings|determine the version)/, /^warning: (unable to access|could not open directory)/];

/** The first line of command output that says what went wrong. */
export function failureReason(output: string): string {
  const lines = output.split("\n").map(line => line.trim()).filter(Boolean);

  return lines.find(line => !NOISE.some(pattern => pattern.test(line))) ?? "The command did not succeed.";
}
