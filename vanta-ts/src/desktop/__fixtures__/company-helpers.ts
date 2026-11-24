import type { WorkerRunRequest, WorkerRunResult, WorkerRuntime } from "../company-ports.js";
import type { CompanyHarness } from "./company-harness.js";

/** Stub worker runtime: writes one report and a cost figure. `gate` holds the run open. */
export function stubRuntime(opts: { gate?: (request: WorkerRunRequest) => Promise<void>; result?: Partial<Extract<WorkerRunResult, { ok: true }>> | { ok: false; error: string } } = {}): WorkerRuntime & { calls: WorkerRunRequest[] } {
  const calls: WorkerRunRequest[] = [];
  return {
    id: "stub",
    calls,
    async run(request) {
      calls.push(request);
      await opts.gate?.(request);
      if (opts.result && "ok" in opts.result && opts.result.ok === false) return opts.result;
      return {
        ok: true,
        summary: `finished ${request.task.id}`,
        artifacts: [{ artifact: `# Report for ${request.task.title}\nAll done.`, kind: "report" }],
        usage: { inputTokens: 100, outputTokens: 50 },
        cost: { usd: 0.1, basis: "estimated" },
        provider: "openai",
        model: "gpt-stub",
        ...(opts.result as object | undefined),
      };
    },
  };
}

async function waitFor<T>(read: () => Promise<T | null | undefined>): Promise<T> {
  for (let attempt = 0; attempt < 300; attempt++) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for the approval request");
}

/** Fire a POST that needs owner approval, answer the approval, and return the POST reply. */
export async function postWithApproval(h: CompanyHarness, path: string, body: unknown, approved = true): Promise<{ status: number; body: any }> {
  const pending = h.post(path, body);
  const request = await waitFor(async () => (await h.get("/api/approval")).body as { id: string } | null);
  await h.post("/api/approval", { id: request.id, approved });
  return pending;
}

export async function hireDev(h: CompanyHarness, extra: Record<string, unknown> = {}): Promise<void> {
  const reply = await postWithApproval(h, "/api/company/workers/hire", { role: "Engineer", adapter: "openai", ...extra });
  if (reply.status !== 200) throw new Error(`hire failed: ${JSON.stringify(reply.body)}`);
}
