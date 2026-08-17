import type { EffectGateContext } from "./execute-effect.js";

export function allowTestEffectGate(projectRoot: string): EffectGateContext {
  return {
    kernel: { assess: async () => ({ risk: "allow", reason: "synthetic test gate" }) },
    approval: { request: async () => true },
    projectRoot,
    sessionId: "synthetic-test",
    permissionMode: "default",
  };
}
