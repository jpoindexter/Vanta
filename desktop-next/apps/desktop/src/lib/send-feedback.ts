import {
  FeedbackReceiptSchema,
  FeedbackReportSchema,
  type FeedbackReceipt,
  type FeedbackReport,
} from "@vanta/shared/feedback";

export const FEEDBACK_ENDPOINT =
  "https://vanta-feedback.jason-poindexter.workers.dev/reports";

export async function sendFeedback(
  report: FeedbackReport,
  fetcher: typeof fetch = fetch,
): Promise<FeedbackReceipt> {
  const response = await fetcher(FEEDBACK_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(FeedbackReportSchema.parse(report)),
    signal: AbortSignal.timeout(20_000),
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw new Error("Delivery not confirmed");
  const receipt = FeedbackReceiptSchema.parse(await response.json());
  if (receipt.id !== report.id)
    throw new Error("Receipt does not match report");
  return receipt;
}
