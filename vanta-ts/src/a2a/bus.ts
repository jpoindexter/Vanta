import { A2ABus } from "./local.js";

/**
 * Process-level A2A bus. Subagents register themselves here so the
 * `send_message` tool can route messages to them by id.
 */
export const globalBus = new A2ABus();
