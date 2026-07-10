import type { StreamEvent } from "../agent.js";
import type { ImageAttachment } from "../types.js";
import type { OutboundDeliveryReceipt, OutboundMessage, PlatformAdapter } from "./platforms/base.js";

export type GatewayStreamEvent =
  | { type: "MessageChunk"; text: string }
  | { type: "Commentary"; text: string }
  | { type: "MessageStop"; text: string };

export type GatewayStreamEmitter = (event: GatewayStreamEvent) => void;
export type GatewayHandle = (
  text: string,
  images?: ImageAttachment[],
  emit?: GatewayStreamEmitter,
) => Promise<string>;

export type GatewayStreamSnapshot = {
  streamedText: string;
  canonicalText: string;
  commentaryCount: number;
  drifted: boolean;
  stopped: boolean;
};

type SinkOptions = {
  platform: PlatformAdapter;
  target: Pick<OutboundMessage, "chatId" | "threadId">;
  record: (message: OutboundMessage) => Promise<void>;
  delivered?: (message: OutboundMessage, receipt: OutboundDeliveryReceipt) => Promise<void>;
  log?: (message: string) => void;
};

export function createGatewayStreamSink(options: SinkOptions): {
  emit: (event: GatewayStreamEvent) => Promise<void>;
  snapshot: () => GatewayStreamSnapshot;
} {
  let streamedText = "";
  let canonicalText = "";
  let commentaryCount = 0;
  let drifted = false;
  let stopped = false;

  const emit = async (event: GatewayStreamEvent): Promise<void> => {
    if (stopped) throw new Error("gateway stream already stopped");
    if (event.type === "MessageChunk") { streamedText += event.text; return; }
    if (event.type === "Commentary") { commentaryCount++; return; }
    canonicalText = event.text;
    drifted = streamedText.length > 0 && streamedText !== canonicalText;
    stopped = true;
    if (drifted) options.log?.("  stream drift: buffered chunks differed from canonical reply; delivered MessageStop only");
    const message: OutboundMessage = { ...options.target, text: canonicalText };
    const receipt = await options.platform.send(message);
    if (receipt) await options.delivered?.(message, receipt);
    await options.record(message);
  };

  const snapshot = (): GatewayStreamSnapshot => ({ streamedText, canonicalText, commentaryCount, drifted, stopped });
  return { emit, snapshot };
}

export function commentaryFromAgentEvent(event: StreamEvent): string | null {
  if (event.type === "thinking" || event.type === "note") return event.text;
  if (event.type === "tool_start") return `using ${event.name}`;
  if (event.type === "tool_end") return `${event.name} ${event.ok ? "completed" : "failed"}`;
  return null;
}
