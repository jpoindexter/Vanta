import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

const STATES = ["draft", "queued", "running", "waiting", "needs human", "stopped", "failed", "unverified", "verified"];
const PROJECTIONS = ["Captured", "Now", "Waiting", "Needs You", "Done"];
const DISPOSITIONS = ["none", "confirmed", "denied", "expired", "unknown", "compensated"];
const HOSTS = ["cli", "desktop", "goal-progress", "jobs", "memory", "messaging", "tui"];
const REPRESENTATIVE_PATHS = ["calendar", "file", "job", "message", "restart", "ui"];

function exact(actual, expected, label) {
  if (!Array.isArray(actual) || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`TRUST-04 ${label} must be exact`);
  }
}

function quotedArray(source, name) {
  const match = source.match(new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`));
  if (!match) throw new Error(`authoritative ${name} array is missing`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

async function validateEvidence(root, entry) {
  if (!entry || typeof entry !== "object" || typeof entry.id !== "string") throw new Error("ledger entry id is required");
  if (typeof entry.source !== "string" || typeof entry.anchor !== "string" || !entry.anchor) {
    throw new Error(`${entry.id} source and anchor are required`);
  }
  const source = await readFile(join(root, entry.source), "utf8")
    .catch(() => { throw new Error(`${entry.id} source path is missing`); });
  if (!source.includes(entry.anchor)) throw new Error(`${entry.id} source anchor is missing`);
  if (!Array.isArray(entry.tests) || entry.tests.length === 0) throw new Error(`${entry.id} evidence paths are required`);
  for (const path of entry.tests) {
    await access(join(root, path)).catch(() => { throw new Error(`${entry.id} evidence path is missing: ${path}`); });
  }
}

async function validateContractBoundary(root, entry) {
  if (typeof entry.contractBoundary !== "string") {
    throw new Error(`${entry.id} contract boundary path and anchor are required`);
  }
  const separator = entry.contractBoundary.lastIndexOf("#");
  const path = entry.contractBoundary.slice(0, separator);
  const anchor = entry.contractBoundary.slice(separator + 1);
  if (separator <= 0 || !path || !anchor) {
    throw new Error(`${entry.id} contract boundary path and anchor are required`);
  }
  const source = await readFile(join(root, path), "utf8")
    .catch(() => { throw new Error(`${entry.id} contract boundary source is missing`); });
  if (!source.includes(anchor)) throw new Error(`${entry.id} contract boundary anchor is missing`);
}

export async function validateTrust04HostLedger(root, ledger) {
  if (ledger?.version !== 1 || !ledger.contract || !Array.isArray(ledger.hosts)) {
    throw new Error("TRUST-04 host ledger version 1 is required");
  }
  exact(ledger.contract.states, STATES, "lifecycle states");
  exact(ledger.contract.projections, PROJECTIONS, "projections");
  exact(ledger.contract.dispositions, DISPOSITIONS, "dispositions");

  const roadmap = JSON.parse(await readFile(join(root, "..", "roadmap.json"), "utf8"));
  const card = roadmap.items?.find((item) => item.id === "TRUST-04");
  if (card?.status !== "shipped") throw new Error("TRUST-04 roadmap state must be shipped");

  const contractSource = await readFile(join(root, "src/work-items/contract.ts"), "utf8");
  exact(quotedArray(contractSource, "WORK_ITEM_STATES"), STATES, "authoritative lifecycle states");
  exact(quotedArray(contractSource, "RECEIPT_DISPOSITIONS"), DISPOSITIONS, "authoritative dispositions");

  const hostIds = ledger.hosts.map((entry) => entry.id).sort();
  exact(hostIds, HOSTS, "supported hosts");
  if (new Set(hostIds).size !== hostIds.length) throw new Error("TRUST-04 supported hosts must be unique");
  for (const host of ledger.hosts) {
    await validateEvidence(root, host);
    await validateContractBoundary(root, host);
  }

  if (!Array.isArray(ledger.representativePaths)) throw new Error("TRUST-04 representative paths are required");
  const pathIds = ledger.representativePaths.map((entry) => entry.id).sort();
  exact(pathIds, REPRESENTATIVE_PATHS, "representative paths");
  for (const path of ledger.representativePaths) await validateEvidence(root, path);

  return { ok: true, roadmapState: card.status, hosts: hostIds, representativePaths: pathIds.length };
}
