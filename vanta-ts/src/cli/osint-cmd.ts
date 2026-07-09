import { buildOsintPlan, formatOsintPlan } from "../osint/framework.js";

type ParsedArgs = {
  subject: string;
  domain?: string;
  ticker?: string;
  jurisdiction?: string;
  json: boolean;
};

export function runOsintCommand(rest: string[], log = console.log): number {
  const parsed = parseArgs(rest);
  if (!parsed) {
    log("usage: vanta osint plan <subject> [--domain <domain>] [--ticker <ticker>] [--jurisdiction <jurisdiction>] [--json]");
    return 1;
  }
  const plan = buildOsintPlan(parsed.subject, parsed);
  log(parsed.json ? JSON.stringify(plan, null, 2) : formatOsintPlan(plan));
  return 0;
}

function parseArgs(rest: string[]): ParsedArgs | null {
  const args = rest[0] === "plan" ? rest.slice(1) : rest;
  const subjectParts: string[] = [];
  const parsed: ParsedArgs = { subject: "", json: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (isValueFlag(arg)) {
      const value = args[i + 1];
      if (value === undefined || value === "") return null;
      setOption(parsed, arg, value);
      i += 1;
      continue;
    }
    subjectParts.push(arg);
  }
  parsed.subject = subjectParts.join(" ").trim();
  return parsed.subject ? parsed : null;
}

function isValueFlag(flag: string): flag is "--domain" | "--ticker" | "--jurisdiction" {
  return flag === "--domain" || flag === "--ticker" || flag === "--jurisdiction";
}

function setOption(parsed: ParsedArgs, flag: string, value: string): void {
  if (flag === "--domain") parsed.domain = value;
  if (flag === "--ticker") parsed.ticker = value;
  if (flag === "--jurisdiction") parsed.jurisdiction = value;
}
