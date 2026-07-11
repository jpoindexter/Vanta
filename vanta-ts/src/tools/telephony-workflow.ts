import { z } from "zod";
import { searchTelephonyNumbers, type TelephonyResult } from "../telephony/client.js";
import { latestTelephonyStates, loadTelephonyReceipts } from "../telephony/receipts.js";
import { NumberSearchSchema, TelephonyActionSchema, previewTelephonyAction, telephonyEligibility, type NumberSearch, type TelephonyAction } from "../telephony/schema.js";
import { executeTelephony, type TelephonyExecutor } from "../telephony/service.js";
import type { Tool } from "./types.js";

const Args = z.discriminatedUnion("action", [
  z.object({ action: z.literal("search_numbers"), search: NumberSearchSchema }).strict(),
  z.object({ action: z.enum(["preview", "execute"]), contract: TelephonyActionSchema }).strict(),
  z.object({ action: z.literal("status") }).strict(),
]);
type Deps = { search?: (request: NumberSearch) => Promise<TelephonyResult>; execute?: TelephonyExecutor };

function statusLine(receipt: ReturnType<typeof latestTelephonyStates>[number]): string {
  return `${receipt.actionId}\t${receipt.action}\t${receipt.providerStatus}\t${receipt.providerId ?? "pending"}`;
}

async function inspectAction(data: z.infer<typeof Args>, root: string, deps: Deps) {
  if (data.action === "search_numbers") {
    const result = await (deps.search ?? searchTelephonyNumbers)(data.search);
    return { ok: result.ok, output: result.ok ? JSON.stringify(result.data, null, 2) : `number search stopped: ${result.state}` };
  }
  if (data.action === "status") {
    const states = latestTelephonyStates(await loadTelephonyReceipts(root));
    return { ok: true, output: states.length ? states.map(statusLine).join("\n") : "no telephony receipts" };
  }
  return null;
}

export function buildTelephonyWorkflowTool(deps: Deps = {}): Tool {
  return {
    schema: {
      name: "telephony_workflow",
      description: "Search test numbers or preview/execute consented Twilio SMS, bounded calls, and number provisioning. Requires explicit purpose, consent, time window, recording/retention choice, idempotency, fresh approval, and lifecycle receipts.",
      parameters: { type: "object", required: ["action"], properties: { action: { type: "string", enum: ["search_numbers", "preview", "execute", "status"] }, search: { type: "object" }, contract: { type: "object" } } },
    },
    describeForSafety: (raw) => raw.action === "execute" ? `execute telephony action ${String((raw.contract as { id?: string })?.id ?? "unknown")}` : "inspect telephony workflow",
    async execute(raw, ctx) {
      const parsed = Args.safeParse(raw); if (!parsed.success) return { ok: false, output: `invalid telephony request: ${parsed.error.issues[0]?.message ?? "invalid input"}` };
      const inspected = await inspectAction(parsed.data, ctx.root, deps); if (inspected) return inspected;
      if (!("contract" in parsed.data)) return { ok: false, output: "invalid telephony action" };
      const preview = previewTelephonyAction(parsed.data.contract), issues = telephonyEligibility(parsed.data.contract);
      if (parsed.data.action === "preview") return { ok: issues.length === 0, output: `${preview}\n${issues.length ? `blocked: ${issues.join("; ")}` : "eligible for fresh approval"}` };
      const result = await executeTelephony(ctx.root, parsed.data.contract, {
        execute: deps.execute,
        approve: (detail) => ctx.requestApproval(
          `Authorize this exact telephony action:\n${detail}`,
          "contacts a recipient or provisions a paid number once under the stated consent and time window",
          "telephony_workflow",
          { diff: detail, fresh: true },
        ),
      });
      return { ok: result.ok, output: result.ok ? `telephony ${result.state}; lifecycle receipt recorded` : `telephony stopped: ${result.state}` };
    },
  };
}

export const telephonyWorkflowTool = buildTelephonyWorkflowTool();
