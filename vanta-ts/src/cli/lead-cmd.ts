import {
  formatLeadershipWorkObject,
  readLeadershipWork,
  recordLeadershipMessage,
  type LeadershipChatResult,
  type LeadershipWorkObject,
} from "../cofounder/leadership-chat.js";

export type LeadDeps = {
  record: (message: string) => Promise<LeadershipChatResult>;
  read: () => Promise<LeadershipWorkObject[]>;
  log: (line: string) => void;
};

const USAGE = [
  "usage:",
  "  vanta lead \"<message>\"",
  "  vanta lead list",
].join("\n");

export async function handleLead(rest: string[], deps: LeadDeps): Promise<number> {
  const [sub, ...args] = rest;
  if (sub === "list") return handleLeadList(deps);

  const message = rest.join(" ").trim();
  if (!message) {
    deps.log(USAGE);
    return sub === undefined ? 0 : 1;
  }

  const result = await deps.record(message);
  deps.log(result.reply);
  for (const object of result.objects) deps.log(formatLeadershipWorkObject(object));
  return result.objects.length > 0 ? 0 : 1;
}

async function handleLeadList(deps: LeadDeps): Promise<number> {
  const objects = await deps.read();
  if (objects.length === 0) {
    deps.log("no leadership work objects yet");
    return 0;
  }
  for (const object of objects) deps.log(formatLeadershipWorkObject(object));
  return 0;
}

function liveLeadDeps(): LeadDeps {
  return {
    record: (message) => recordLeadershipMessage(message),
    read: () => readLeadershipWork(),
    log: (line) => console.log(line),
  };
}

export async function runLeadCommand(rest: string[]): Promise<number> {
  return handleLead(rest, liveLeadDeps());
}
