import { groupToolsByDomain } from "./term/capabilities.js";
import type { Goal } from "./types.js";

const LOGO = String.raw`
   █████╗ ██████╗  ██████╗  ██████╗
  ██╔══██╗██╔══██╗██╔════╝ ██╔═══██╗
  ███████║██████╔╝██║  ███╗██║   ██║
  ██╔══██║██╔══██╗██║   ██║██║   ██║
  ██║  ██║██║  ██║╚██████╔╝╚██████╔╝
  ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝`;

type BannerData = { modelId: string; root: string; goals: Goal[]; toolNames: string[]; skillNames: string[] };

export function renderBanner(d: BannerData): string {
  const active = d.goals.filter((g) => g.status === "active");
  const goalLines = active.length
    ? active.map((g) => `    [${g.id}] ${g.text}`).join("\n")
    : "    (none — add one with: cargo run -- goals add \"...\")";
  const skills = d.skillNames.length ? d.skillNames.join(", ") : "(none yet — run `modes install`, or the agent writes its own)";
  return [
    LOGO, "",
    "  Vanta — trusted operator. Knows the goal, gates every action, reports only verified output.",
    `  model   ${d.modelId}`, `  root    ${d.root}`, "",
    "  Active goals:", goalLines, "",
    `  Capabilities (${d.toolNames.length} tools):`,
    ...groupToolsByDomain(d.toolNames).map((g) => `    ${g.label.padEnd(34)} ${g.tools.join(", ")}`),
    "", `  Skills: ${skills}`, "",
    "  Type a message and press enter. /help for commands, /exit to quit.", "",
  ].join("\n");
}
