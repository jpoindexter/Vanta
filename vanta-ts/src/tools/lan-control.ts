import { z } from "zod";
import type { Tool } from "./types.js";
import {
  type ControlRequest,
  type ControlSender,
  checkLanTarget,
  describeControl,
  sendControl,
} from "../reach/lan-control.js";

const Args = z.object({
  url: z.string().min(1),
  method: z.enum(["POST", "PUT", "GET"]).optional(),
  body: z.string().optional(),
  contentType: z.string().optional(),
  timeoutMs: z.number().int().min(50).max(10_000).optional(),
});

const DEFAULT_TIMEOUT_MS = 4000;
const SNIPPET_MAX = 400;

/** The live HTTP sender — the only network IO; tests inject a fake instead. */
const liveSender: ControlSender = async (req: ControlRequest, timeoutMs: number) => {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(req.url, {
      method: req.method,
      body: req.body,
      headers: req.contentType ? { "content-type": req.contentType } : undefined,
      signal: ac.signal,
      redirect: "manual",
    });
    const text = (await res.text()).slice(0, SNIPPET_MAX);
    return { status: res.status, bodySnippet: text };
  } finally {
    clearTimeout(timer);
  }
};

/** Build the control request from parsed args (method defaults to POST). Pure. */
function toRequest(a: z.infer<typeof Args>): ControlRequest {
  return { url: a.url, method: a.method ?? "POST", body: a.body, contentType: a.contentType };
}

export function buildLanControlTool(sender: ControlSender = liveSender): Tool {
  return {
    schema: {
      name: "lan_control",
      description:
        "Drive a local LAN device discovered by lan_discover: send a mutating HTTP request " +
        "(POST/PUT, or GET for control endpoints) to its local API. LAN-only (refuses non-private hosts) " +
        "and ALWAYS approval-gated — the human confirms the exact request before it is sent.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The device endpoint, e.g. http://192.168.1.50:1400/MediaRenderer/..." },
          method: { type: "string", enum: ["POST", "PUT", "GET"], description: "HTTP method (default POST)" },
          body: { type: "string", description: "Request body (e.g. SOAP/JSON command)" },
          contentType: { type: "string", description: "Content-Type header for the body" },
          timeoutMs: { type: "integer", minimum: 50, maximum: 10000, description: "Request timeout (default 4000)" },
        },
        required: ["url"],
      },
    },
    // Mutating → surface the target so the kernel Asks.
    describeForSafety: (a) => `control lan device: ${String(a.method ?? "POST")} ${String(a.url ?? "")}`,
    async execute(raw, ctx) {
      const parsed = Args.safeParse(raw);
      if (!parsed.success) return { ok: false, output: 'lan_control needs a "url" (LAN device endpoint)' };
      const req = toRequest(parsed.data);
      const guard = checkLanTarget(req.url);
      if (!guard.ok) return { ok: false, output: `lan_control: ${guard.error}` };

      const approved = await ctx.requestApproval(
        `lan_control: ${describeControl(req)}`,
        "sends a mutating command to a local network device",
      );
      if (!approved) return { ok: false, output: "denied" };

      const r = await sendControl(req, sender, parsed.data.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      if (!r.ok) return { ok: false, output: `lan_control failed: ${r.error}` };
      return { ok: true, output: `${req.method} ${req.url} → ${r.result.status}\n${r.result.bodySnippet || "(empty body)"}` };
    },
  };
}

export const lanControlTool: Tool = buildLanControlTool();
