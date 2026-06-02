import { useEffect, useRef, useState } from "react";
import { loadAlwaysAllow, addAlwaysAllow } from "../sessions/approvals-store.js";
import type { ApprovalChoice } from "./approval.js";
import type { Action } from "./app.js";

// Owns the HITL approval state behind the conversation's requestApproval gate.
// once/session live in a ref for the session; "always" also persists via
// approvals-store. Seeds the session set from the persisted list on mount so a
// previously always-allowed tool never re-prompts.

export type Pending = { action: string; reason: string; toolName?: string };

export function useApproval(dispatch: (a: Action) => void): {
  pending: Pending | null;
  requestApproval: (action: string, reason: string, toolName?: string) => Promise<boolean>;
  chooseApproval: (choice: ApprovalChoice) => void;
} {
  const [pending, setPending] = useState<Pending | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);
  const allowRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    void loadAlwaysAllow(process.env).then((tools) => tools.forEach((t) => allowRef.current.add(t)));
  }, []);

  const requestApproval = (action: string, reason: string, toolName?: string): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      if (toolName && allowRef.current.has(toolName)) return resolve(true);
      resolveRef.current = resolve;
      setPending({ action, reason, toolName });
    });

  const chooseApproval = (choice: ApprovalChoice): void => {
    const tool = pending?.toolName;
    if (choice === "deny") {
      resolveRef.current?.(false);
      dispatch({ t: "note", text: "✗ denied" });
    } else {
      if (tool && (choice === "session" || choice === "always")) allowRef.current.add(tool);
      if (tool && choice === "always") void addAlwaysAllow(tool, process.env).catch(() => {});
      resolveRef.current?.(true);
      const scope = choice === "always" ? " (always)" : choice === "session" ? " (this session)" : "";
      dispatch({ t: "note", text: `✓ approved${scope}` });
    }
    resolveRef.current = null;
    setPending(null);
  };

  return { pending, requestApproval, chooseApproval };
}
