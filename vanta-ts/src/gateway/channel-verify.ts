import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PlatformAdapter } from "./platforms/base.js";
import { MESSAGING_CATALOG, platformAvailability } from "./platforms/registry.js";
import { ADAPTERS } from "./platforms/adapter-registry.js";

export type ChannelVerifyStatus = "live" | "not-configured" | "failed" | "missing-adapter";

export type ChannelVerifyResult = {
  id: string;
  label: string;
  status: ChannelVerifyStatus;
  missingEnv: string[];
  evidence: string;
};

export type ChannelVerifyReport = {
  generatedAt: string;
  timeoutMs: number;
  totals: Record<ChannelVerifyStatus, number>;
  results: ChannelVerifyResult[];
  decision: string;
  ledgerPath?: string;
};

const DEFAULT_TIMEOUT_MS = 5000;

function timeout<T>(label: string, ms: number, work: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function probeAdapter(adapter: PlatformAdapter, timeoutMs: number): Promise<string> {
  await timeout(`${adapter.id}.connect`, timeoutMs, adapter.connect());
  const messages = await timeout(`${adapter.id}.poll`, timeoutMs, adapter.poll());
  await timeout(`${adapter.id}.disconnect`, timeoutMs, adapter.disconnect());
  return `connect/poll/disconnect completed; poll returned ${messages.length} message(s)`;
}

function count(results: ChannelVerifyResult[]): Record<ChannelVerifyStatus, number> {
  const totals: Record<ChannelVerifyStatus, number> = {
    live: 0,
    "not-configured": 0,
    failed: 0,
    "missing-adapter": 0,
  };
  for (const r of results) totals[r.status] += 1;
  return totals;
}

async function verifyPlatform(
  platform: (typeof MESSAGING_CATALOG)[number],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<ChannelVerifyResult> {
  const entry = ADAPTERS[platform.id];
  const availability = platformAvailability(platform, env);
  const base = { id: platform.id, label: platform.label };
  if (!entry) {
    return { ...base, status: "missing-adapter", missingEnv: availability.missing, evidence: "catalog entry has no registered PlatformAdapter" };
  }
  if (!entry.configured(env)) {
    const evidence = availability.missing.length > 0
      ? `missing ${availability.missing.join(", ")}`
      : "adapter configured() returned false";
    return { ...base, status: "not-configured", missingEnv: availability.missing, evidence };
  }
  try {
    const evidence = await probeAdapter(entry.build(env), timeoutMs);
    return { ...base, status: "live", missingEnv: [], evidence };
  } catch (err) {
    const evidence = err instanceof Error ? err.message : String(err);
    return { ...base, status: "failed", missingEnv: [], evidence };
  }
}

export async function verifyMessagingChannels(opts: {
  env?: NodeJS.ProcessEnv;
  dataDir?: string;
  now?: Date;
  timeoutMs?: number;
} = {}): Promise<ChannelVerifyReport> {
  const env = opts.env ?? process.env;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const results: ChannelVerifyResult[] = [];
  for (const platform of MESSAGING_CATALOG) results.push(await verifyPlatform(platform, env, timeoutMs));

  const generatedAt = (opts.now ?? new Date()).toISOString();
  const report: ChannelVerifyReport = {
    generatedAt,
    timeoutMs,
    totals: count(results),
    results,
    decision:
      "Native mobile nodes and a shareable channel/skills ecosystem stay out of this parity card; track native mobile as RUN-ANYWHERE-TERMUX and treat shareable channel packages as a separate ecosystem card.",
  };
  if (opts.dataDir) {
    const dir = join(opts.dataDir, "channel-verification");
    await mkdir(dir, { recursive: true });
    const file = join(dir, `${generatedAt.replace(/[:.]/g, "-")}.json`);
    await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    report.ledgerPath = file;
  }
  return report;
}

export function formatChannelVerifyReport(report: ChannelVerifyReport): string {
  const lines = [
    `channel verification ${report.generatedAt}`,
    `live ${report.totals.live} · not-configured ${report.totals["not-configured"]} · failed ${report.totals.failed} · missing-adapter ${report.totals["missing-adapter"]}`,
    "",
    ...report.results.map((r) => {
      const missing = r.missingEnv.length ? ` (${r.missingEnv.join(", ")})` : "";
      return `${r.id.padEnd(12)} ${r.status.padEnd(14)} ${r.evidence}${missing}`;
    }),
    "",
    `decision: ${report.decision}`,
  ];
  if (report.ledgerPath) lines.push(`ledger: ${report.ledgerPath}`);
  return lines.join("\n");
}
