import { join } from "node:path";
import { CHECKOUT_FIXTURE, runAdversarialUxPass, type UxObservation } from "../ux/adversarial.js";

type Reader = (url: string) => Promise<{ ok: true; text: string } | { ok: false; error: string }>;

export type AdversarialUxDeps = {
  log?: (line: string) => void;
  readUrl?: Reader;
};

export async function runAdversarialUxCommand(repoRoot: string, rest: string[], deps: AdversarialUxDeps = {}): Promise<number> {
  const log = deps.log ?? console.log;
  const persona = value(rest, "--persona") ?? "hostile novice";
  const fixture = value(rest, "--fixture");
  const url = value(rest, "--url");
  if (!fixture && !url) return usage(log);
  const observations = fixture ? fixtureObservations(fixture) : await urlObservations(url!, deps.readUrl ?? readVisibleText);
  if (!observations.ok) {
    log(observations.error);
    return 1;
  }
  const result = await runAdversarialUxPass({ dataDir: join(repoRoot, ".vanta"), observations: observations.value, persona });
  log(formatResult(result));
  return 0;
}

function usage(log: (line: string) => void): number {
  log("usage: vanta adversarial-ux --fixture checkout | --url <http-url> [--persona <name>]");
  return 1;
}

function fixtureObservations(name: string): { ok: true; value: UxObservation[] } | { ok: false; error: string } {
  if (name === "checkout") return { ok: true, value: CHECKOUT_FIXTURE };
  return { ok: false, error: `unknown adversarial UX fixture: ${name}` };
}

async function urlObservations(url: string, read: Reader): Promise<{ ok: true; value: UxObservation[] } | { ok: false; error: string }> {
  const page = await read(url);
  if (!page.ok) return page;
  return {
    ok: true,
    value: [
      { area: "page", text: page.text.includes("error") ? "Visible error state found on the page." : "Page loaded; no concrete adversarial failure observed from text-only pass." },
    ],
  };
}

async function readVisibleText(url: string): ReturnType<Reader> {
  const { openWithSession } = await import("../reach/browser-session.js");
  const result = await openWithSession(url, null);
  return result.ok ? { ok: true, text: result.text } : { ok: false, error: result.error };
}

function formatResult(result: Awaited<ReturnType<typeof runAdversarialUxPass>>): string {
  const ticketLines = result.tickets.map((t, i) => `  - ${t.id}: ${result.findings[i]?.title ?? t.title}`);
  return [
    `Adversarial UX (${result.persona})`,
    `created ${result.tickets.length} ticket(s); ignored ${result.ignored.length} noisy observation(s)`,
    ...(ticketLines.length ? ticketLines : ["  - no actionable UX tickets"]),
  ].join("\n");
}

function value(args: string[], key: string): string | undefined {
  const idx = args.indexOf(key);
  return idx === -1 ? undefined : args[idx + 1];
}
