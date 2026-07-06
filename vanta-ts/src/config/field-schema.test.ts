import { describe, it, expect } from "vitest";
import { resolveField, renderField, renderSurface, fieldUpdate, type FieldDescriptor } from "./field-schema.js";

// EXT-MEMORY-FIELD-SCHEMA — a surface is declared as data; the generic renderer
// + config path handle it; secrets are write-only.

// A whole pluggable surface, defined by DATA ALONE (no bespoke code):
const MEMORY_BACKEND: FieldDescriptor[] = [
  { key: "provider", label: "Backend", kind: "select", envKey: "VANTA_MEM_BACKEND", options: ["local", "mem0", "zep"] },
  { key: "endpoint", label: "Endpoint", kind: "text", envKey: "VANTA_MEM_URL", placeholder: "https://api.mem0.ai" },
  { key: "apiKey", label: "API key", kind: "secret", envKey: "VANTA_MEM_KEY", aliases: ["MEM0_API_KEY"] },
];

describe("resolveField", () => {
  it("reads text/select values across envKey → aliases → fallbacks", () => {
    const f: FieldDescriptor = { key: "k", label: "K", kind: "text", envKey: "A", aliases: ["B"], envFallbacks: ["C"] };
    expect(resolveField(f, { B: "viaAlias" })).toEqual({ kind: "text", value: "viaAlias" });
    expect(resolveField(f, { C: "viaFallback" })).toEqual({ kind: "text", value: "viaFallback" });
    expect(resolveField(f, { A: "direct", B: "x" })).toEqual({ kind: "text", value: "direct" }); // first hit wins
    expect(resolveField(f, {})).toEqual({ kind: "text", value: undefined });
  });

  it("a SECRET yields only is_set — never the value (write-only)", () => {
    const secret = MEMORY_BACKEND[2]!;
    const set = resolveField(secret, { VANTA_MEM_KEY: "sk-super-secret" });
    expect(set).toEqual({ kind: "secret", isSet: true });
    expect(JSON.stringify(set)).not.toContain("sk-super-secret");
    expect(resolveField(secret, {})).toEqual({ kind: "secret", isSet: false });
    // Reads is_set through the alias too.
    expect(resolveField(secret, { MEM0_API_KEY: "x" })).toEqual({ kind: "secret", isSet: true });
  });
});

describe("renderField / renderSurface", () => {
  it("masks a secret and never prints its value", () => {
    const line = renderField(MEMORY_BACKEND[2]!, { VANTA_MEM_KEY: "sk-leak" });
    expect(line).toContain("•••• (set)");
    expect(line).not.toContain("sk-leak");
    expect(renderField(MEMORY_BACKEND[2]!, {})).toContain("not set");
  });

  it("shows a text value or its placeholder", () => {
    expect(renderField(MEMORY_BACKEND[1]!, { VANTA_MEM_URL: "https://x" })).toContain("https://x");
    expect(renderField(MEMORY_BACKEND[1]!, {})).toContain("e.g. https://api.mem0.ai");
  });

  it("renders a whole declared surface, one line per field", () => {
    const out = renderSurface(MEMORY_BACKEND, { VANTA_MEM_BACKEND: "mem0", VANTA_MEM_KEY: "sk" });
    expect(out.split("\n")).toHaveLength(3);
    expect(out).toContain("Backend: mem0");
    expect(out).toContain("•••• (set)");
    expect(out).not.toContain("sk");
  });
});

describe("fieldUpdate (the generic config path)", () => {
  it("writes text/secret verbatim to envKey; rejects empty", () => {
    expect(fieldUpdate(MEMORY_BACKEND[1]!, "https://x")).toEqual({ ok: true, updates: { VANTA_MEM_URL: "https://x" } });
    expect(fieldUpdate(MEMORY_BACKEND[2]!, "sk-new")).toEqual({ ok: true, updates: { VANTA_MEM_KEY: "sk-new" } });
    expect(fieldUpdate(MEMORY_BACKEND[1]!, "  ")).toEqual({ ok: false, error: "Endpoint cannot be empty" });
  });

  it("validates a select against its options", () => {
    expect(fieldUpdate(MEMORY_BACKEND[0]!, "mem0")).toEqual({ ok: true, updates: { VANTA_MEM_BACKEND: "mem0" } });
    const bad = fieldUpdate(MEMORY_BACKEND[0]!, "pinecone");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain("local, mem0, zep");
  });
});
