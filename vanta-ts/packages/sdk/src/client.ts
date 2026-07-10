import type {
  VantaApproval, VantaApprovalDecision, VantaEvent, VantaOpenedSession,
  VantaSession, VantaStatus, VantaTurn,
} from "./types.js";

export type VantaClientOptions = {
  baseUrl: string;
  token: string;
  channelId?: string;
  fetch?: typeof fetch;
};

export class VantaApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "VantaApiError";
  }
}

export class VantaClient {
  readonly channelId: string;
  activeSessionId?: string;
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: VantaClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.token = options.token;
    this.channelId = options.channelId ?? randomId();
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    if (!this.fetchImpl) throw new Error("VantaClient requires a fetch implementation");
  }

  status(): Promise<VantaStatus> { return this.request("/status"); }
  listSessions(): Promise<VantaSession[]> { return this.request("/sessions"); }

  async startSession(): Promise<{ id: string }> {
    const session = await this.request<{ id: string }>("/sessions", { method: "POST" });
    this.activeSessionId = session.id;
    return session;
  }

  async openSession(id: string): Promise<VantaOpenedSession> {
    const session = await this.request<VantaOpenedSession>("/sessions/open", { method: "POST", body: { id } });
    this.activeSessionId = session.id;
    return session;
  }

  async sendInput(message: string): Promise<VantaTurn> {
    const turn = await this.request<VantaTurn>("/input", { method: "POST", body: { message } });
    this.activeSessionId = turn.sessionId;
    return turn;
  }

  async streamInput(message: string, onEvent: (event: VantaEvent) => void): Promise<VantaTurn> {
    const controller = new AbortController();
    const response = await this.openEventResponse(controller.signal);
    if (!response.body) throw new VantaApiError(502, "Vanta event stream has no response body");
    const terminal = consumeTurn(response.body, onEvent);
    try {
      const [turn, completed] = await Promise.all([this.sendInput(message), terminal]);
      if (!completed.ok) throw new VantaApiError(500, "Vanta turn failed while streaming");
      return turn;
    } finally { controller.abort(); }
  }

  currentApproval(): Promise<VantaApproval | null> { return this.request("/approvals/current"); }

  resolveApproval(id: string, decision: VantaApprovalDecision): Promise<{ ok: true }> {
    return this.request("/approvals/resolve", { method: "POST", body: { id, decision } });
  }

  async *events(signal?: AbortSignal): AsyncGenerator<VantaEvent> {
    const response = await this.openEventResponse(signal);
    if (!response.body) throw new VantaApiError(502, "Vanta event stream has no response body");
    yield* parseEventStream(response.body);
  }

  private async openEventResponse(signal?: AbortSignal): Promise<Response> {
    const response = await this.fetchImpl(`${this.baseUrl}/events`, { headers: this.headers(), signal });
    await assertOk(response);
    return response;
  }

  private async request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: this.headers(options.body !== undefined),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    await assertOk(response);
    return response.json() as Promise<T>;
  }

  private headers(json = false): Record<string, string> {
    return {
      authorization: `Bearer ${this.token}`,
      "x-session-id": this.channelId,
      ...(json ? { "content-type": "application/json" } : {}),
    };
  }
}

async function assertOk(response: Response): Promise<void> {
  if (response.ok) return;
  let message = `${response.status} ${response.statusText}`.trim();
  try { message = String((await response.json() as { error?: unknown }).error ?? message); } catch {}
  throw new VantaApiError(response.status, message);
}

async function* parseEventStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<VantaEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const data = frame.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        if (data) yield JSON.parse(data) as VantaEvent;
      }
      if (done) break;
    }
  } finally { reader.releaseLock(); }
}

async function consumeTurn(stream: ReadableStream<Uint8Array>, onEvent: (event: VantaEvent) => void): Promise<Extract<VantaEvent, { type: "turn.completed" }>> {
  for await (const event of parseEventStream(stream)) {
    onEvent(event);
    if (event.type === "turn.completed") return event;
  }
  throw new VantaApiError(502, "Vanta event stream ended before turn completion");
}

function normalizeBaseUrl(value: string): string {
  return `${value.replace(/\/+$/, "").replace(/\/api\/v1$/, "")}/api/v1`;
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `sdk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
