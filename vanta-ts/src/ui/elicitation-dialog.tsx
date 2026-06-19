import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { FOCUS, ACTIVITY } from "../term/palette.js";

// Rendered when a connected MCP server requests user input mid-call (an
// "elicitation" server→client request). Shows the server's message + a single
// free-text field; ⏎ accepts (resolves the request with the typed value), Esc
// cancels. The MCP elicitation result shape is { action, content }.

/** A pending elicitation surfaced by an MCP server. `field` names the value key
 * the server expects in `content`; defaults to "value". */
export type ElicitationRequest = {
  server: string;
  message: string;
  field?: string;
  resolve: (result: Record<string, unknown>) => void;
};

/** Pull a human-readable prompt out of an MCP elicitation request's params. Pure. */
export function elicitationMessage(params: unknown): string {
  if (params && typeof params === "object") {
    const m = (params as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  return "The server is requesting input.";
}

export function ElicitationDialog(props: { request: ElicitationRequest; onDone: () => void }): ReactElement {
  const { request, onDone } = props;
  const [value, setValue] = useState("");
  const accept = (): void => { request.resolve({ action: "accept", content: { [request.field ?? "value"]: value } }); onDone(); };
  const cancel = (): void => { request.resolve({ action: "cancel", content: {} }); onDone(); };
  useInput((input, key) => {
    if (key.escape) return cancel();
    if (key.return) return accept();
    if (key.backspace || key.delete) return void setValue((v) => v.slice(0, -1));
    if (input && !key.ctrl && !key.meta) setValue((v) => v + input);
  });
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold><Text color={ACTIVITY}>⚠ MCP input requested</Text> · {request.server}</Text>
      <Text> </Text>
      <Text>{request.message}</Text>
      <Text> </Text>
      <Text><Text color={FOCUS}>❯ </Text>{value}<Text color={FOCUS}>▏</Text></Text>
      <Text> </Text>
      <Text>  ⏎ send · Esc cancel</Text>
    </Box>
  );
}
