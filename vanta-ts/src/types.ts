// Core types shared across the Vanta agent layer.

export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
export type EffortLevel = typeof EFFORT_LEVELS[number];

export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** TOOL-CALL-REPAIR: the repair strategy used when the model's arg JSON was malformed (else undefined). */
  repaired?: string;
  /** Durable lifecycle marker used to recover dangling calls after process death. */
  effectState?: "pending" | "started";
};

export type EffectDisposition = "none" | "confirmed" | "unknown";

/** An image attached to a user turn — sent natively to the model (no file tool). */
export type ImageAttachment = { mime: string; dataBase64: string };

export type Message =
  | { role: "system"; content: string }
  | { role: "user"; content: string; images?: ImageAttachment[] }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string; effectDisposition?: EffectDisposition };

export type Risk = "allow" | "ask" | "block";

export type Verdict = {
  risk: Risk;
  needsHuman: boolean;
  reason: string;
};

export type Goal = {
  id: number;
  text: string;
  status: "active" | "done";
};
