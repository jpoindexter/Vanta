import { describe, expect, it, vi } from "vitest";
import { sendFeedback } from "./send-feedback";

const report = {
  id: "f1f123a7-41fd-4b9d-b5cd-7e968868e832",
  kind: "bug" as const,
  title: "Synthetic",
  details: "Test only",
  steps: "",
  facts: null,
};
describe("private feedback transport", () => {
  it("accepts only a matching stored receipt and never retries", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          {
            id: report.id,
            storedAt: "2026-11-17T10:00:00.000Z",
            notification: "sent",
          },
          { status: 201 },
        ),
      );
    expect(await sendFeedback(report, fetcher)).toMatchObject({
      id: report.id,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(report);
  });
  it("does not mistake an HTTP success or a different report receipt for delivery", async () => {
    await expect(
      sendFeedback(
        report,
        vi.fn().mockResolvedValue(Response.json({ ok: true })),
      ),
    ).rejects.toThrow();
    await expect(
      sendFeedback(
        report,
        vi
          .fn()
          .mockResolvedValue(
            Response.json({
              id: crypto.randomUUID(),
              storedAt: "2026-11-17T10:00:00.000Z",
              notification: "sent",
            }),
          ),
      ),
    ).rejects.toThrow();
  });
  it("leaves a failed request to explicit retry, not an automatic second POST", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("Connection reset"));
    await expect(sendFeedback(report, fetcher)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
