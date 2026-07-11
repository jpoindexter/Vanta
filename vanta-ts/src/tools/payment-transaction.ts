import { z } from "zod";
import { PaymentContractSchema } from "../payments/contract.js";
import { executePayment, previewPayment, type PaymentProvider } from "../payments/service.js";
import type { Tool } from "./types.js";

const Args = z.object({ action: z.enum(["preview", "execute"]), contract: PaymentContractSchema }).strict();

export function buildPaymentTransactionTool(provider?: PaymentProvider): Tool {
  return {
    schema: {
      name: "payment_transaction",
      description: "Preview or execute a strict test-gated payment contract. Exact totals, caps, expiry, replay protection, fresh operator approval, provider approval, redacted receipts, and HTTP 402 validation are mandatory. Never accepts card data, API keys, or plaintext credentials.",
      parameters: {
        type: "object", required: ["action", "contract"],
        properties: {
          action: { type: "string", enum: ["preview", "execute"] },
          contract: { type: "object", description: "Strict version-1 payment contract. Use minor units and provider_cli credential storage only." },
        },
      },
    },
    describeForSafety: (raw) => raw.action === "execute" ? `request payment transaction ${String((raw.contract as { id?: string })?.id ?? "unknown")}` : "inspect transaction terms",
    async execute(raw, ctx) {
      const parsed = Args.safeParse(raw);
      if (!parsed.success) return { ok: false, output: `invalid payment contract: ${parsed.error.issues[0]?.message ?? "invalid input"}` };
      try {
        if (parsed.data.action === "preview") {
          const result = await previewPayment(ctx.root, parsed.data.contract);
          return { ok: result.assessment.ok, output: `${result.preview}\n${result.assessment.ok ? "eligible for fresh approval" : `blocked: ${result.assessment.issues.join("; ")}`}` };
        }
        const result = await executePayment(ctx.root, parsed.data.contract, {
          provider,
          approve: (preview) => ctx.requestApproval(
            `Authorize this exact transaction:\n${preview}`,
            "payment approval applies once to this transaction ID and cannot be cached",
            "payment_transaction",
            { diff: preview, fresh: true },
          ),
        });
        return { ok: result.ok, output: result.ok ? `payment ${result.state}; redacted receipt recorded` : `payment stopped: ${result.state}${result.assessment ? ` (${result.assessment.issues.join("; ")})` : ""}` };
      } catch { return { ok: false, output: "payment stopped: secure transaction ledger or provider unavailable" }; }
    },
  };
}

export const paymentTransactionTool = buildPaymentTransactionTool();
