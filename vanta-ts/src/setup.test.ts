import { describe, it, expect, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { upsertEnv, upsertEnvMigratingLegacy, removeEnvKeys, buildEnvUpdates, runSetup, envPath } from "./setup.js";
import { providerById, PROVIDER_CATALOG } from "./providers/catalog.js";
import { select } from "./term/select.js";

vi.mock("./term/select.js", () => ({ select: vi.fn() }));
const mSelect = vi.mocked(select);

describe("upsertEnv", () => {
  it("replaces an existing uncommented key in place", () => {
    const out = upsertEnv("VANTA_PROVIDER=ollama\nVANTA_MODEL=qwen2.5:14b\n", {
      VANTA_PROVIDER: "gemini",
    });
    expect(out).toContain("VANTA_PROVIDER=gemini");
    expect(out).not.toContain("VANTA_PROVIDER=ollama");
    expect(out).toContain("VANTA_MODEL=qwen2.5:14b"); // untouched
  });

  it("preserves unrelated secrets — never regenerates", () => {
    const existing =
      "# comment\nVANTA_PROVIDER=ollama\nVANTA_GOOGLE_CLIENT_ID=abc\nSERPAPI_KEY=xyz\n";
    const out = upsertEnv(existing, { VANTA_PROVIDER: "gemini", GEMINI_API_KEY: "k" });
    expect(out).toContain("# comment");
    expect(out).toContain("VANTA_GOOGLE_CLIENT_ID=abc");
    expect(out).toContain("SERPAPI_KEY=xyz");
    expect(out).toContain("VANTA_PROVIDER=gemini");
    expect(out).toContain("GEMINI_API_KEY=k");
  });

  it("appends new keys not already present", () => {
    const out = upsertEnv("VANTA_PROVIDER=openai\n", { OPENAI_API_KEY: "sk-1" });
    expect(out).toContain("VANTA_PROVIDER=openai");
    expect(out).toContain("OPENAI_API_KEY=sk-1");
  });

  it("does not treat a commented key as a real assignment", () => {
    const out = upsertEnv("# VANTA_PROVIDER=openai\n", { VANTA_PROVIDER: "gemini" });
    expect(out).toContain("# VANTA_PROVIDER=openai"); // comment kept
    expect(out).toContain("VANTA_PROVIDER=gemini"); // real key appended
  });

  it("handles an empty starting file and ends with one newline", () => {
    const out = upsertEnv("", { VANTA_PROVIDER: "gemini", VANTA_MODEL: "gemini-2.5-flash" });
    expect(out).toBe("VANTA_PROVIDER=gemini\nVANTA_MODEL=gemini-2.5-flash\n");
  });
});

describe("removeEnvKeys", () => {
  it("removes uncommented lines for the given keys, preserving everything else", () => {
    const out = removeEnvKeys("ARGO_PROVIDER=codex\nVANTA_MODEL=x\n# keep\n", ["ARGO_PROVIDER"]);
    expect(out).not.toContain("ARGO_PROVIDER");
    expect(out).toContain("VANTA_MODEL=x");
    expect(out).toContain("# keep");
  });

  it("is a no-op for an empty key list or empty body", () => {
    expect(removeEnvKeys("A=1\n", [])).toBe("A=1\n");
    expect(removeEnvKeys("", ["A"])).toBe("");
  });
});

describe("upsertEnvMigratingLegacy", () => {
  it("strips the stale ARGO_ twin of an updated VANTA_ key (the stuck-on-codex fix)", () => {
    const existing = "ARGO_PROVIDER=codex\nGOOGLE_OAUTH=keep\n";
    const out = upsertEnvMigratingLegacy(existing, { VANTA_PROVIDER: "gemini", VANTA_MODEL: "gemini-2.5-flash" });
    expect(out).not.toContain("ARGO_PROVIDER");
    expect(out).toContain("VANTA_PROVIDER=gemini");
    expect(out).toContain("VANTA_MODEL=gemini-2.5-flash");
    expect(out).toContain("GOOGLE_OAUTH=keep");
  });

  it("leaves non-legacy keys (the provider key var) untouched", () => {
    const out = upsertEnvMigratingLegacy("OPENAI_API_KEY=sk-1\n", { VANTA_PROVIDER: "openai", VANTA_MODEL: "gpt-4o" });
    expect(out).toContain("OPENAI_API_KEY=sk-1");
    expect(out).toContain("VANTA_PROVIDER=openai");
  });
});

describe("buildEnvUpdates", () => {
  it("emits provider + model + key for a keyed provider", () => {
    const gemini = providerById("gemini");
    expect(gemini).toBeDefined();
    const u = buildEnvUpdates(gemini!, "my-key", "gemini-2.5-pro");
    expect(u).toEqual({
      VANTA_PROVIDER: "gemini",
      VANTA_MODEL: "gemini-2.5-pro",
      GEMINI_API_KEY: "my-key",
    });
  });

  it("omits the key var for a keyless provider", () => {
    const ollama = providerById("ollama");
    expect(ollama).toBeDefined();
    const u = buildEnvUpdates(ollama!, undefined, "qwen2.5:14b");
    expect(u).toEqual({ VANTA_PROVIDER: "ollama", VANTA_MODEL: "qwen2.5:14b" });
    expect(Object.keys(u)).not.toContain("OLLAMA_API_KEY");
  });
});

describe("runSetup (integration)", () => {
  async function tempRepo(seedEnv?: string): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "vanta-setup-"));
    await mkdir(join(root, "vanta-ts"), { recursive: true });
    if (seedEnv !== undefined) await writeFile(join(root, "vanta-ts", ".env"), seedEnv);
    return root;
  }

  it("writes a keyless provider's merged .env from the arrow-key picks", async () => {
    const root = await tempRepo("VANTA_GOOGLE_CLIENT_ID=keepme\nVANTA_PROVIDER=gemini\n");
    const ollama = PROVIDER_CATALOG.findIndex((p) => p.id === "ollama");
    mSelect.mockReset();
    mSelect.mockResolvedValueOnce(ollama).mockResolvedValueOnce(0); // provider=ollama, model=first
    expect(await runSetup(root, { quiet: true })).toBe(true);
    const env = await readFile(envPath(root), "utf8");
    expect(env).toContain("VANTA_GOOGLE_CLIENT_ID=keepme"); // preserved
    expect(env).toContain("VANTA_PROVIDER=ollama"); // replaced
    expect(env).toContain("VANTA_MODEL=qwen2.5:14b"); // first ollama model (keyless → no key prompt)
    expect(env).not.toContain("VANTA_PROVIDER=gemini");
  });

  it("does not write provider config when validation fails", async () => {
    const root = await tempRepo("VANTA_PROVIDER=gemini\n");
    const ollama = PROVIDER_CATALOG.findIndex((p) => p.id === "ollama");
    mSelect.mockReset();
    mSelect.mockResolvedValueOnce(ollama).mockResolvedValueOnce(0);
    const validate = vi.fn(async () => ({ ok: false, detail: "model did not respond" }));
    expect(await runSetup(root, { quiet: true, validate })).toBe(false);
    const env = await readFile(envPath(root), "utf8");
    expect(validate).toHaveBeenCalledWith({ VANTA_PROVIDER: "ollama", VANTA_MODEL: "qwen2.5:14b" });
    expect(env).toBe("VANTA_PROVIDER=gemini\n");
  });
});
