import { z } from "zod";

// Ollama native embeddings endpoint shape (not the /v1 OpenAI-compat path)
const OllamaEmbedResponse = z.object({
  embedding: z.array(z.number()),
});

const DEFAULT_OLLAMA_BASE = "http://localhost:11434";
const DEFAULT_MODEL = "nomic-embed-text";
const FETCH_TIMEOUT_MS = 5_000;
const PROBE_TEXT = "ok";

/** Strip any OpenAI-compat suffix so we land on the native Ollama base. */
function resolveOllamaBase(env: NodeJS.ProcessEnv): string {
  const raw = env.VANTA_OLLAMA_URL ?? DEFAULT_OLLAMA_BASE;
  // VANTA_OLLAMA_URL may include /v1 for the OpenAI adapter — strip it.
  return raw.replace(/\/v1\/?$/, "");
}

function embedModel(env: NodeJS.ProcessEnv): string {
  return env.VANTA_EMBED_MODEL ?? DEFAULT_MODEL;
}

/**
 * POST to Ollama's native /api/embeddings endpoint.
 * Returns the embedding vector or null on any failure — never throws.
 */
export async function embed(
  text: string,
  env: NodeJS.ProcessEnv,
): Promise<number[] | null> {
  const base = resolveOllamaBase(env);
  const model = embedModel(env);
  const url = `${base}/api/embeddings`;

  let res: Response;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text }),
      signal: ac.signal,
    });
    clearTimeout(timer);
  } catch {
    return null;
  }

  if (!res.ok) return null;

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return null;
  }

  const parsed = OllamaEmbedResponse.safeParse(json);
  return parsed.success ? parsed.data.embedding : null;
}

/**
 * Cosine similarity between two equal-length vectors, 0..1-ish.
 * Returns 0 for zero-vectors or mismatched lengths.
 */
export function cosineSim(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) ** 2;
    normB += (b[i] ?? 0) ** 2;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Cheap probe: embed a tiny string and check it's non-null.
 * Use this to decide whether to attempt semantic ranking.
 */
export async function embedAvailable(
  env: NodeJS.ProcessEnv,
): Promise<boolean> {
  const vec = await embed(PROBE_TEXT, env);
  return vec !== null && vec.length > 0;
}
