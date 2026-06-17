import type {
  CodeContextOptions,
  CodeIndexOptions,
  CodeIntelProvider,
  CodeIntelScope,
  CodeSearchOptions,
} from "./interface.js";

/** Reason returned by every method when code intelligence is disabled. */
const DISABLED = "code intelligence is disabled (VANTA_CODE_INTEL=off)";

/**
 * Null-object adapter — used when code intelligence is turned off. Always
 * reports unavailable so tools degrade gracefully to a no-op instead of erroring,
 * and never shells out to anything.
 */
export class NullCodeIntelProvider implements CodeIntelProvider {
  readonly id = "null";
  async isAvailable(): Promise<boolean> {
    return false;
  }
  async context(_task: string, _opts?: CodeContextOptions): Promise<string> {
    throw new Error(DISABLED);
  }
  async search(_query: string, _opts?: CodeSearchOptions): Promise<string> {
    throw new Error(DISABLED);
  }
  async affected(_files: string[], _opts?: CodeIntelScope): Promise<string> {
    throw new Error(DISABLED);
  }
  async status(_opts?: CodeIntelScope): Promise<string> {
    throw new Error(DISABLED);
  }
  async index(_opts?: CodeIndexOptions): Promise<string> {
    throw new Error(DISABLED);
  }
  async sync(_opts?: CodeIntelScope): Promise<string> {
    throw new Error(DISABLED);
  }
}
