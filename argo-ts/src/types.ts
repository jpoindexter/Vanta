// Core types shared across the Argo agent layer.

export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type Message =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
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
