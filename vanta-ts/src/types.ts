// Core types shared across the Vanta agent layer.

export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

/** An image attached to a user turn — sent natively to the model (no file tool). */
export type ImageAttachment = { mime: string; dataBase64: string };

export type Message =
  | { role: "system"; content: string }
  | { role: "user"; content: string; images?: ImageAttachment[] }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

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
