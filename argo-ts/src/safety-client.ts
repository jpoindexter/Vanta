import { z } from "zod";
import type { Goal, Verdict } from "./types.js";

const VerdictResponse = z.object({
  risk: z.enum(["allow", "ask", "block"]),
  needs_human: z.boolean(),
  reason: z.string(),
});

const GoalsResponse = z.array(
  z.object({
    id: z.number(),
    text: z.string(),
    status: z.enum(["active", "done"]),
  }),
);

const ApprovalResponse = z.object({ id: z.number() }).passthrough();

/** HTTP client for the Rust safety kernel sidecar. */
export class SafetyClient {
  constructor(private readonly baseUrl: string) {}

  async status(): Promise<boolean> {
    try {
      const r = await fetch(`${this.baseUrl}/api/status`);
      return r.ok;
    } catch {
      return false;
    }
  }

  async assess(action: string): Promise<Verdict> {
    const r = await fetch(`${this.baseUrl}/api/assess`, {
      method: "POST",
      body: action,
    });
    const json = VerdictResponse.parse(await r.json());
    return {
      risk: json.risk,
      needsHuman: json.needs_human,
      reason: json.reason,
    };
  }

  async getGoals(): Promise<Goal[]> {
    const r = await fetch(`${this.baseUrl}/api/goals`);
    return GoalsResponse.parse(await r.json());
  }

  async getApprovals(): Promise<unknown[]> {
    const r = await fetch(`${this.baseUrl}/api/approvals`);
    const json: unknown = await r.json();
    return Array.isArray(json) ? json : [];
  }

  async proposeApproval(action: string): Promise<number | null> {
    const r = await fetch(`${this.baseUrl}/api/approvals/propose`, {
      method: "POST",
      body: action,
    });
    const parsed = ApprovalResponse.safeParse(await r.json());
    return parsed.success ? parsed.data.id : null;
  }

  async approve(id: number): Promise<void> {
    await fetch(`${this.baseUrl}/api/approvals/approve/${id}`, {
      method: "POST",
    });
  }

  async deny(id: number): Promise<void> {
    await fetch(`${this.baseUrl}/api/approvals/deny/${id}`, { method: "POST" });
  }

  async logEvent(event: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/api/log`, { method: "POST", body: event });
    } catch {
      // logging is best-effort; never break the loop on a log failure
    }
  }
}
