import type { AgentOutcome } from "../agent.js";
import {
  resolveStreamingTtsConfig,
  type ResolvedTts,
  type StreamingTtsConfig,
} from "../routing/tts.js";
import { ClauseSplitter } from "./clause-splitter.js";
import { synthesize, type SpeakOutcome } from "./synth.js";

export type TtsSynthesize = (
  text: string,
  resolved: ResolvedTts,
  env: NodeJS.ProcessEnv,
) => Promise<SpeakOutcome>;

export type StreamingSpeechReceipt = {
  mode: "streaming" | "whole" | "unavailable";
  provider: string;
  queuedClauses: number;
  spokenClauses: number;
  droppedClauses: number;
  toolBoundaries: number;
  firstClauseMs?: number;
  drifted: boolean;
  error?: string;
};

type StreamingSpeechDeps = {
  env?: NodeJS.ProcessEnv;
  synthesize?: TtsSynthesize;
  now?: () => number;
};

function comparable(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export class StreamingSpeechSession {
  private readonly splitter: ClauseSplitter;
  private readonly startedAt: number;
  private readonly synth: TtsSynthesize;
  private readonly env: NodeJS.ProcessEnv;
  private tail: Promise<void> = Promise.resolve();
  private generation = 0;
  private assembled = "";
  private queuedClauses = 0;
  private spokenClauses = 0;
  private droppedClauses = 0;
  private toolBoundaries = 0;
  private firstClauseMs: number | undefined;
  private error: string | undefined;
  private drifted = false;
  private closed = false;

  constructor(
    private readonly config: StreamingTtsConfig,
    deps: StreamingSpeechDeps = {},
  ) {
    this.env = deps.env ?? process.env;
    this.synth = deps.synthesize ?? synthesize;
    this.startedAt = (deps.now ?? Date.now)();
    this.now = deps.now ?? Date.now;
    this.splitter = new ClauseSplitter({
      minChars: config.minClauseChars,
      maxChars: config.maxClauseChars,
    });
  }

  private readonly now: () => number;

  push(delta: string): void {
    if (this.closed || !delta) return;
    this.assembled += delta;
    for (const clause of this.splitter.push(delta)) this.enqueue(clause);
  }

  /**
   * A tool call means streamed prose may be an interim draft. Drop anything
   * not yet spoken, reset the splitter, and let the next model pass start fresh.
   */
  markToolBoundary(): void {
    if (this.closed) return;
    this.generation += 1;
    this.toolBoundaries += 1;
    this.assembled = "";
    this.splitter.reset();
  }

  async finish(finalText: string): Promise<StreamingSpeechReceipt> {
    if (this.closed) return this.receipt(finalText);
    if (!this.assembled.trim()) {
      this.enqueue(finalText.trim());
    } else if (comparable(this.assembled) !== comparable(finalText)) {
      this.drifted = true;
      this.generation += 1;
      this.splitter.reset();
      this.assembled = finalText;
      this.enqueue(finalText.trim());
    } else {
      for (const clause of this.splitter.flush()) this.enqueue(clause);
    }
    this.closed = true;
    await this.tail;
    return this.receipt(finalText);
  }

  cancel(): void {
    if (this.closed) return;
    this.closed = true;
    this.generation += 1;
    this.splitter.reset();
    this.assembled = "";
  }

  private enqueue(clause: string): void {
    if (!clause) return;
    if (this.queuedClauses >= this.config.maxClauses) {
      this.droppedClauses += 1;
      return;
    }
    const generation = this.generation;
    this.queuedClauses += 1;
    if (this.firstClauseMs === undefined) {
      this.firstClauseMs = Math.max(0, this.now() - this.startedAt);
    }
    this.tail = this.tail.then(async () => {
      if (generation !== this.generation || this.error) {
        this.droppedClauses += 1;
        return;
      }
      const outcome = await this.synth(clause, this.config.tts, this.env);
      if (generation !== this.generation) {
        if (outcome.ok) this.spokenClauses += 1;
        return;
      }
      if (!outcome.ok) {
        this.error = outcome.output;
        return;
      }
      this.spokenClauses += 1;
    }).catch((error: unknown) => {
      this.error = error instanceof Error ? error.message : String(error);
    });
  }

  private receipt(finalText: string): StreamingSpeechReceipt {
    return {
      mode: this.config.tts.ready ? "streaming" : "unavailable",
      provider: this.config.tts.provider.id,
      queuedClauses: this.queuedClauses,
      spokenClauses: this.spokenClauses,
      droppedClauses: this.droppedClauses,
      toolBoundaries: this.toolBoundaries,
      ...(this.firstClauseMs === undefined ? {} : { firstClauseMs: this.firstClauseMs }),
      drifted: this.drifted ||
        Boolean(this.assembled.trim()) &&
          comparable(this.assembled) !== comparable(finalText),
      ...(this.error ? { error: this.error } : {}),
    };
  }
}

export type VoiceTurnSpeaker = {
  callbacks: {
    onTextDelta?: (delta: string) => void;
    onToolCall?: (name: string, args: Record<string, unknown>) => void;
  };
  run<T extends Pick<AgentOutcome, "finalText">>(
    send: () => Promise<T>,
  ): Promise<{ outcome: T; speech: StreamingSpeechReceipt }>;
};

/**
 * Host adapter shared by push-to-talk and wake-word loops. Streaming is opt-in;
 * disabled mode preserves one whole-response synthesis through the same
 * configured provider.
 */
export function createVoiceTurnSpeaker(
  env: NodeJS.ProcessEnv = process.env,
  deps: StreamingSpeechDeps = {},
): VoiceTurnSpeaker {
  const config = resolveStreamingTtsConfig(env);
  const synth = deps.synthesize ?? synthesize;
  let active: StreamingSpeechSession | null = null;
  const callbacks = config.enabled
    ? {
        onTextDelta: (delta: string) => active?.push(delta),
        onToolCall: () => active?.markToolBoundary(),
      }
    : {};
  return {
    callbacks,
    async run(send) {
      active = config.enabled && config.tts.ready
        ? new StreamingSpeechSession(config, { ...deps, env, synthesize: synth })
        : null;
      try {
        const outcome = await send();
        if (active) {
          return { outcome, speech: await active.finish(outcome.finalText) };
        }
        if (!config.tts.ready) {
          return {
            outcome,
            speech: {
              mode: "unavailable",
              provider: config.tts.provider.id,
              queuedClauses: 0,
              spokenClauses: 0,
              droppedClauses: 0,
              toolBoundaries: 0,
              drifted: false,
              error: `missing ${config.tts.missingKey ?? "TTS configuration"}`,
            },
          };
        }
        const spoken = outcome.finalText.trim()
          ? await synth(outcome.finalText, config.tts, env)
          : { ok: true, output: "empty response" };
        return {
          outcome,
          speech: {
            mode: "whole",
            provider: config.tts.provider.id,
            queuedClauses: outcome.finalText.trim() ? 1 : 0,
            spokenClauses: spoken.ok && outcome.finalText.trim() ? 1 : 0,
            droppedClauses: 0,
            toolBoundaries: 0,
            drifted: false,
            ...(!spoken.ok ? { error: spoken.output } : {}),
          },
        };
      } catch (error) {
        active?.cancel();
        throw error;
      } finally {
        active = null;
      }
    },
  };
}
