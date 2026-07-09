import { readFile } from "node:fs/promises";

export type MarketingProvider = "amplitude" | "customerio";
export type MarketingRecord = {
  provider: MarketingProvider;
  kind: "event" | "campaign";
  id: string;
  name: string;
  metric?: number;
  at?: string;
};

export type MarketingReadOpts = {
  provider: MarketingProvider;
  fixture?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
};

export async function readMarketing(opts: MarketingReadOpts): Promise<MarketingRecord[]> {
  const raw = opts.fixture ? JSON.parse(await readFile(opts.fixture, "utf8")) : await fetchLive(opts);
  return opts.provider === "amplitude" ? normalizeAmplitude(raw) : normalizeCustomerIo(raw);
}

export function normalizeAmplitude(raw: unknown): MarketingRecord[] {
  const rows = Array.isArray(raw) ? raw : asRecord(raw).events;
  return (Array.isArray(rows) ? rows : []).map((row, i) => {
    const r = asRecord(row);
    return {
      provider: "amplitude",
      kind: "event",
      id: String(r.event_id ?? r.id ?? i),
      name: String(r.event_type ?? r.name ?? "unknown_event"),
      metric: numberish(r.count ?? r.value),
      at: typeof r.event_time === "string" ? r.event_time : undefined,
    };
  });
}

export function normalizeCustomerIo(raw: unknown): MarketingRecord[] {
  const rows = Array.isArray(raw) ? raw : asRecord(raw).campaigns;
  return (Array.isArray(rows) ? rows : []).map((row, i) => {
    const r = asRecord(row);
    return {
      provider: "customerio",
      kind: "campaign",
      id: String(r.id ?? r.campaign_id ?? i),
      name: String(r.name ?? r.title ?? "untitled_campaign"),
      metric: numberish(r.sent_count ?? r.metric),
      at: typeof r.created === "string" ? r.created : undefined,
    };
  });
}

export function formatMarketing(records: MarketingRecord[]): string {
  if (!records.length) return "marketing: no records";
  return records.map((r) => `${r.provider} ${r.kind} ${r.id} · ${r.name}${r.metric === undefined ? "" : ` · ${r.metric}`}${r.at ? ` · ${r.at}` : ""}`).join("\n");
}

async function fetchLive(opts: MarketingReadOpts): Promise<unknown> {
  const env = opts.env ?? process.env;
  const fetcher = opts.fetchImpl ?? fetch;
  const cfg = liveConfig(opts.provider, env);
  if (!cfg) throw new Error(`missing ${opts.provider} credentials`);
  const res = await fetcher(cfg.url, { headers: cfg.headers });
  if (!res.ok) throw new Error(`${opts.provider} HTTP ${res.status}`);
  return res.json();
}

function liveConfig(provider: MarketingProvider, env: NodeJS.ProcessEnv): { url: string; headers: Record<string, string> } | null {
  if (provider === "amplitude") {
    const key = env.AMPLITUDE_API_KEY;
    if (!key) return null;
    return { url: env.AMPLITUDE_EVENTS_URL ?? "https://amplitude.com/api/2/events/list", headers: { Authorization: `Bearer ${key}` } };
  }
  const key = env.CUSTOMERIO_APP_API_KEY;
  if (!key) return null;
  return { url: env.CUSTOMERIO_CAMPAIGNS_URL ?? "https://api.customer.io/v1/campaigns", headers: { Authorization: `Bearer ${key}` } };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function numberish(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
