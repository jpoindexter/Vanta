import { maybeSandbox } from "../../sandbox/run.js";
import type { ExecBackendAdapter } from "../backend-port.js";

export function createLocalExecAdapter(): ExecBackendAdapter {
  return {
    id: "local",
    async wrap(args) {
      return { ok: true, invocation: await maybeSandbox(args) };
    },
  };
}

