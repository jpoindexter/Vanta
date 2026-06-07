import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergedEnv, buildProviderForSelection, persistSelectionGlobal, parseModelArg } from "./model-switch.js";
import type { ModelSelection } from "./model-picker.js";

const sel = (over: Partial<ModelSelection> = {}): ModelSelection => ({
  providerId: "ollama",
  model: "llama3.3",
  persistGlobal: false,
  ...over,
});

describe("mergedEnv", () => {
  it("layers provider + model over the base env", () => {
    const out = mergedEnv(sel(), { FOO: "bar" } as NodeJS.ProcessEnv);
    expect(out.VANTA_PROVIDER).toBe("ollama");
    expect(out.VANTA_MODEL).toBe("llama3.3");
    expect(out.FOO).toBe("bar");
  });

  it("injects the API key for a keyed provider", () => {
    const out = mergedEnv(sel({ providerId: "gemini", model: "gemini-2.5-pro", apiKey: "k-123" }), {} as NodeJS.ProcessEnv);
    expect(out.GEMINI_API_KEY).toBe("k-123");
  });
});

describe("buildProviderForSelection", () => {
  it("builds a keyless provider at the chosen model", () => {
    const provider = buildProviderForSelection(sel({ model: "qwen2.5:14b" }), {} as NodeJS.ProcessEnv);
    expect(provider.modelId()).toBe("qwen2.5:14b");
  });

  it("builds a keyed provider when the key is present", () => {
    const provider = buildProviderForSelection(
      sel({ providerId: "gemini", model: "gemini-2.5-pro", apiKey: "k-123" }),
      {} as NodeJS.ProcessEnv,
    );
    expect(provider.modelId()).toBe("gemini-2.5-pro");
  });

  it("throws actionably when a keyed provider has no key", () => {
    expect(() => buildProviderForSelection(sel({ providerId: "anthropic", model: "claude-sonnet-4-6" }), {} as NodeJS.ProcessEnv)).toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe("parseModelArg", () => {
  it("treats a leading provider id as the provider, rest as the model", () => {
    expect(parseModelArg("openai gpt-4o", "ollama")).toEqual({ providerId: "openai", model: "gpt-4o", persistGlobal: true });
  });

  it("uses the provider's default model when only a provider is given", () => {
    expect(parseModelArg("gemini", "openai")).toEqual({ providerId: "gemini", model: "gemini-2.5-flash", persistGlobal: true });
  });

  it("keeps the current provider when the arg is just a model id", () => {
    expect(parseModelArg("gpt-4o-mini", "openai")).toEqual({ providerId: "openai", model: "gpt-4o-mini", persistGlobal: true });
  });

  it("keeps slashed OpenRouter model ids intact under an explicit provider", () => {
    expect(parseModelArg("openrouter anthropic/claude-sonnet-4.5", "ollama")).toEqual({
      providerId: "openrouter",
      model: "anthropic/claude-sonnet-4.5",
      persistGlobal: true,
    });
  });

  it("returns null for an empty arg", () => {
    expect(parseModelArg("   ", "openai")).toBeNull();
  });
});

describe("persistSelectionGlobal", () => {
  it("writes VANTA_PROVIDER/VANTA_MODEL + key into vanta-ts/.env, preserving other lines", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-switch-"));
    await mkdir(join(root, "vanta-ts"), { recursive: true });
    const envFile = join(root, "vanta-ts", ".env");
    await writeFile(envFile, "GOOGLE_OAUTH=keep-me\nVANTA_PROVIDER=openai\n", "utf8");

    await persistSelectionGlobal(sel({ providerId: "gemini", model: "gemini-2.5-pro", apiKey: "k-9" }), root);

    const out = await readFile(envFile, "utf8");
    expect(out).toContain("GOOGLE_OAUTH=keep-me");
    expect(out).toContain("VANTA_PROVIDER=gemini");
    expect(out).toContain("VANTA_MODEL=gemini-2.5-pro");
    expect(out).toContain("GEMINI_API_KEY=k-9");
  });
});
