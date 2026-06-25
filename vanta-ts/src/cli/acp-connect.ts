import { spawnAcpTransport, runAcpClientSession, kernelApprover } from "../acp/client.js";

// VANTA-ACP-CLIENT — `vanta acp connect <agent-cmd> [args...] -- <prompt>`.
// Drives a peer ACP agent over stdio: spawn it, run one prompt turn, stream its
// session/update notifications, and route its permission requests through the
// Vanta kernel (allow-only, headless). The orchestration lives in acp/client.ts.

/** `vanta acp connect <cmd> [args...] -- <prompt>`. Returns a process exit code. */
export async function runAcpConnect(root: string, args: string[]): Promise<number> {
  const sep = args.indexOf("--");
  const cmdParts = sep === -1 ? args : args.slice(0, sep);
  const promptText = sep === -1 ? "" : args.slice(sep + 1).join(" ");
  if (!cmdParts.length || !promptText) {
    console.error("usage: vanta acp connect <agent-cmd> [args...] -- <prompt>");
    return 1;
  }

  const { prepareRun } = await import("../session.js");
  const setup = await prepareRun(root, "acp connect").catch(() => null);
  if (!setup) {
    console.error("vanta acp connect: failed to initialize (kernel/provider)");
    return 1;
  }

  const [cmd, ...cmdArgs] = cmdParts;
  console.log(`vanta acp connect → ${cmdParts.join(" ")}`);
  const r = await runAcpClientSession({
    transport: spawnAcpTransport(cmd!, cmdArgs, root),
    cwd: root,
    prompts: [promptText],
    approve: kernelApprover(setup.safety),
    onUpdate: (u) => process.stdout.write(`  ⇠ ${JSON.stringify(u.update).slice(0, 200)}\n`),
  });
  console.log(`session ${r.sessionId}: ${r.turns.map((t) => t.stopReason).join(", ")}`);
  return 0;
}
