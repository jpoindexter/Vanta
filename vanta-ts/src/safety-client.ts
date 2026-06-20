import { z } from "zod";
import type { Goal, Verdict } from "./types.js";
import type { KernelClient } from "./kernel/client.js";

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

/** HTTP client for the Rust safety kernel sidecar — the default KernelClient adapter.
 * Carries the per-install API token (0600 `.vanta/api-token`) on every request so the
 * kernel authorizes this non-browser caller (a rogue local user lacking the token can't). */
export class SafetyClient implements KernelClient {
  constructor(private readonly baseUrl: string, private readonly token?: string) {}

  private req(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = this.token
      ? { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${this.token}` }
      : init.headers;
    return fetch(`${this.baseUrl}${path}`, { ...init, headers });
  }

  async status(): Promise<boolean> {
    try {
      const r = await this.req("/api/status");
      return r.ok;
    } catch {
      return false;
    }
  }

  async assess(action: string): Promise<Verdict> {
    const r = await this.req("/api/assess", { method: "POST", body: action });
    const json = VerdictResponse.parse(await r.json());
    return {
      risk: json.risk,
      needsHuman: json.needs_human,
      reason: json.reason,
    };
  }

  async getGoals(): Promise<Goal[]> {
    const r = await this.req("/api/goals");
    return GoalsResponse.parse(await r.json());
  }

  /** Add a standing goal the agent works toward across turns. Returns false on failure. */
  async addGoal(text: string): Promise<boolean> {
    try {
      const r = await this.req("/api/goals/add", { method: "POST", body: text });
      return r.ok;
    } catch {
      return false;
    }
  }

  /** Mark a goal complete (the kernel drops it from the active set). */
  async completeGoal(id: number): Promise<boolean> {
    try {
      const r = await this.req(`/api/goals/complete/${id}`, { method: "POST" });
      return r.ok;
    } catch {
      return false;
    }
  }

  async getApprovals(): Promise<unknown[]> {
    const r = await this.req("/api/approvals");
    const json: unknown = await r.json();
    return Array.isArray(json) ? json : [];
  }

  async proposeApproval(action: string): Promise<number | null> {
    const r = await this.req("/api/approvals/propose", { method: "POST", body: action });
    const parsed = ApprovalResponse.safeParse(await r.json());
    return parsed.success ? parsed.data.id : null;
  }

  async approve(id: number): Promise<void> {
    await this.req(`/api/approvals/approve/${id}`, { method: "POST" });
  }

  async deny(id: number): Promise<void> {
    await this.req(`/api/approvals/deny/${id}`, { method: "POST" });
  }

  async logEvent(event: string): Promise<void> {
    try {
      await this.req("/api/log", { method: "POST", body: event });
    } catch {
      // logging is best-effort; never break the loop on a log failure
    }
  }
}
