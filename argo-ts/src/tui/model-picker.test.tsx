import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import { ModelPicker, fuzzyFilter } from "./model-picker.js";
import type { ProviderEntry } from "../providers/catalog.js";

const PROVIDERS: ProviderEntry[] = [
  { id: "gemini", label: "Google Gemini", short: "Gemini", envVar: "GEMINI_API_KEY", defaultModel: "gemini-2.5-flash", models: ["gemini-2.5-flash", "gemini-2.5-pro"] },
  { id: "ollama", label: "Ollama", short: "Ollama", envVar: null, defaultModel: "qwen2.5:14b", models: ["qwen2.5:14b", "llama3.3"] },
  { id: "anthropic", label: "Anthropic", short: "Anthropic", envVar: "ANTHROPIC_API_KEY", defaultModel: "claude-sonnet-4-6", models: ["claude-sonnet-4-6"] },
];
// gemini + keyless ollama have a key; anthropic does not.
const hasKey = (e: ProviderEntry): boolean => e.envVar === null || e.id === "gemini";

const ESC = String.fromCharCode(27); const KEY = { down: ESC + "[B", up: ESC + "[A", enter: String.fromCharCode(13), esc: ESC, ctrlG: String.fromCharCode(7) };
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 20));

const base = { providers: PROVIDERS, currentProviderId: "gemini", currentModel: "gemini-2.5-flash", hasKey, width: 80 };

describe("fuzzyFilter", () => {
  it("ranks contiguous matches by position, then subsequence, then drops misses", () => {
    expect(fuzzyFilter(["gemini-2.5-pro", "gpt-4o", "claude"], "g", (x) => x)).toEqual(["gemini-2.5-pro", "gpt-4o"]);
    expect(fuzzyFilter(["claude-sonnet", "gpt"], "cst", (x) => x)).toEqual(["claude-sonnet"]);
    expect(fuzzyFilter(["a", "b"], "zzz", (x) => x)).toEqual([]);
    expect(fuzzyFilter(["a", "b"], "", (x) => x)).toEqual(["a", "b"]);
  });
});

describe("ModelPicker wizard", () => {
  it("renders providers with current marker + key availability", () => {
    const { lastFrame, unmount } = render(<ModelPicker {...base} onSelect={() => {}} onCancel={() => {}} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Select provider");
    expect(frame).toContain("Gemini");
    expect(frame).toContain("(no key)"); // anthropic
    unmount();
  });

  it("provider with key → model step → ⏎ selects (session persist by default)", async () => {
    const onSelect = vi.fn();
    const { stdin, unmount } = render(<ModelPicker {...base} onSelect={onSelect} onCancel={() => {}} />);
    stdin.write(KEY.enter); // gemini -> model step
    await tick();
    stdin.write(KEY.down); // gemini-2.5-flash -> gemini-2.5-pro
    await tick();
    stdin.write(KEY.enter);
    await tick();
    expect(onSelect).toHaveBeenCalledWith({ providerId: "gemini", model: "gemini-2.5-pro", apiKey: undefined, persistGlobal: false });
    unmount();
  });

  it("^g toggles global persist", async () => {
    const onSelect = vi.fn();
    const { stdin, unmount } = render(<ModelPicker {...base} onSelect={onSelect} onCancel={() => {}} />);
    stdin.write(KEY.ctrlG);
    await tick();
    stdin.write(KEY.enter); // -> model step
    await tick();
    stdin.write(KEY.enter); // first model
    await tick();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ persistGlobal: true, model: "gemini-2.5-flash" }));
    unmount();
  });

  it("accepts a free-typed model id when the filter matches nothing", async () => {
    const onSelect = vi.fn();
    const { stdin, unmount } = render(<ModelPicker {...base} onSelect={onSelect} onCancel={() => {}} />);
    stdin.write(KEY.enter); // -> model step
    await tick();
    for (const ch of "zzz9") {
      stdin.write(ch);
      await tick();
    }
    stdin.write(KEY.enter);
    await tick();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ model: "zzz9", providerId: "gemini" }));
    unmount();
  });

  it("a provider missing its key routes to the key-entry step", async () => {
    const { stdin, lastFrame, unmount } = render(<ModelPicker {...base} onSelect={() => {}} onCancel={() => {}} />);
    stdin.write(KEY.down); // gemini -> ollama
    await tick();
    stdin.write(KEY.down); // ollama -> anthropic
    await tick();
    stdin.write(KEY.enter); // anthropic has no key
    await tick();
    expect(lastFrame() ?? "").toContain("Anthropic API key");
    unmount();
  });

  it("Esc on the provider step cancels", async () => {
    const onCancel = vi.fn();
    const { stdin, unmount } = render(<ModelPicker {...base} onSelect={() => {}} onCancel={onCancel} />);
    stdin.write(KEY.esc);
    await tick();
    expect(onCancel).toHaveBeenCalledOnce();
    unmount();
  });
});
