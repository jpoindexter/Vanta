import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { remember } from "./brain.js";
import { loadEntries } from "./entries.js";
import {
  unifiedRecall,
  primeFromVaultPage,
  dedupeAgainstVault,
  provenancePaths,
  rankVaultPages,
  pageTitleExcerpt,
  isPrimeWorthy,
  vaultRefOf,
  type VaultReader,
} from "./vault-recall.js";
import { normalizeEntry } from "./entry-types.js";
import type { BrainEntry } from "./entries.js";

let home: string;
const prev = process.env.VANTA_HOME;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-vrecall-"));
  process.env.VANTA_HOME = home;
});

afterEach(async () => {
  if (prev === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = prev;
  await rm(home, { recursive: true, force: true });
});

/** An in-memory vault — no filesystem, no MCP. */
function memVault(pages: Record<string, string>): VaultReader {
  return {
    list: async () => Object.keys(pages),
    read: async (p) => pages[p] ?? null,
  };
}

function entry(over: Partial<BrainEntry>): BrainEntry {
  return normalizeEntry({ region: "semantic", content: "x", ...over });
}

describe("pure provenance helpers", () => {
  it("vaultRefOf extracts the vault path from a sourceRef pointer", () => {
    expect(vaultRefOf(entry({ sourceRef: "vault:wiki/concepts/kernel.md" }))).toBe("wiki/concepts/kernel.md");
    expect(vaultRefOf(entry({ sourceRef: "brain:abc" }))).toBeNull();
    expect(vaultRefOf(entry({}))).toBeNull();
  });

  it("provenancePaths collects every vault pointer", () => {
    const set = provenancePaths([
      entry({ id: "a", sourceRef: "vault:p1.md" }),
      entry({ id: "b" }),
      entry({ id: "c", sourceRef: "vault:p2.md" }),
    ]);
    expect([...set].sort()).toEqual(["p1.md", "p2.md"]);
  });

  it("dedupeAgainstVault drops brain entries whose page was already surfaced", () => {
    const entries = [
      entry({ id: "a", content: "kept", sourceRef: "vault:gone.md" }),
      entry({ id: "b", content: "also kept" }),
    ];
    const kept = dedupeAgainstVault(entries, new Set(["gone.md"]));
    expect(kept.map((e) => e.id)).toEqual(["b"]);
  });

  it("dedupeAgainstVault is a no-op when no pages surfaced", () => {
    const entries = [entry({ id: "a", sourceRef: "vault:x.md" })];
    expect(dedupeAgainstVault(entries, new Set())).toHaveLength(1);
  });
});

describe("pageTitleExcerpt", () => {
  it("strips frontmatter + heading marker and excerpts the body", () => {
    const { title, excerpt } = pageTitleExcerpt(
      "---\ntags: [brain]\n---\n\n# Kernel is the boundary\n\nassess() gates every tool call.",
    );
    expect(title).toBe("Kernel is the boundary");
    expect(excerpt).toContain("assess() gates every tool call");
  });
});

describe("rankVaultPages", () => {
  it("scores by query overlap and keeps only relevant pages, top-K", () => {
    const pages = [
      { path: "kernel.md", text: "# Kernel boundary\nThe kernel gates every tool call through assess." },
      { path: "garden.md", text: "# Tomatoes\nWatering schedule for the vegetable garden." },
    ];
    const hits = rankVaultPages(pages, "kernel gates tool call", 3);
    expect(hits[0]?.path).toBe("kernel.md");
    expect(hits.find((h) => h.path === "garden.md")).toBeUndefined(); // irrelevant page dropped
  });
});

describe("unifiedRecall (merges brain + vault, deduped by provenance)", () => {
  it("surfaces brain memories AND relevant vault pages in one call", async () => {
    await remember({ region: "semantic", content: "the kernel gates every tool call" });
    const vault = memVault({
      "wiki/concepts/scope.md": "# Scope enforcement\nVanta enforces scope on every tool call it runs.",
    });
    const r = await unifiedRecall({ query: "tool call scope", reader: vault });
    expect(r.entries.length).toBeGreaterThanOrEqual(1); // brain layer present
    expect(r.vaultPages.map((p) => p.path)).toContain("wiki/concepts/scope.md"); // vault layer present
  });

  it("collapses a brain entry that points at a surfaced vault page (dedup)", async () => {
    // a brain memory graduated to a vault page (write-side stamps sourceRef: vault:<path>)
    await remember({
      region: "semantic",
      content: "the kernel gates every tool call through assess",
      sourceRef: "vault:wiki/concepts/kernel-gate.md",
    });
    const vault = memVault({
      "wiki/concepts/kernel-gate.md": "# Kernel gate\nThe kernel gates every tool call through assess.",
    });
    const r = await unifiedRecall({ query: "kernel gates tool call assess", reader: vault });
    expect(r.vaultPages.map((p) => p.path)).toContain("wiki/concepts/kernel-gate.md");
    // the brain entry that points at that page is collapsed — page wins, no duplicate
    expect(r.entries.some((e) => e.sourceRef === "vault:wiki/concepts/kernel-gate.md")).toBe(false);
  });

  it("keeps a brain entry whose vault page was NOT surfaced", async () => {
    await remember({
      region: "semantic",
      content: "an unrelated graduated fact about widgets and gadgets",
      sourceRef: "vault:wiki/concepts/widgets.md",
    });
    const vault = memVault({
      "wiki/concepts/kernel.md": "# Kernel\nThe kernel gates every tool call.",
    });
    const r = await unifiedRecall({ query: "widgets gadgets", reader: vault });
    expect(r.entries.some((e) => e.sourceRef === "vault:wiki/concepts/widgets.md")).toBe(true);
  });

  it("no reader degrades cleanly to brain-only recall", async () => {
    await remember({ region: "semantic", content: "the kernel gates every tool call" });
    const r = await unifiedRecall({ query: "kernel", reader: null });
    expect(r.vaultPages).toEqual([]);
    expect(r.entries.length).toBeGreaterThanOrEqual(1);
  });

  it("a broken vault reader never breaks brain recall", async () => {
    await remember({ region: "semantic", content: "the kernel gates every tool call" });
    const broken: VaultReader = {
      list: async () => { throw new Error("vault unreachable"); },
      read: async () => { throw new Error("vault unreachable"); },
    };
    const r = await unifiedRecall({ query: "kernel", reader: broken });
    expect(r.vaultPages).toEqual([]);
    expect(r.entries.length).toBeGreaterThanOrEqual(1); // brain layer unaffected
  });
});

describe("isPrimeWorthy", () => {
  it("flags pages about the user or a standing project", () => {
    expect(isPrimeWorthy("# Jason's workflow\nI prefer options objects.")).toBe(true);
    expect(isPrimeWorthy("# Vanta project\nThe goal is a trusted operator.")).toBe(true);
  });

  it("does not flag generic world-knowledge pages", () => {
    expect(isPrimeWorthy("# Photosynthesis\nPlants convert sunlight to energy.")).toBe(false);
  });

  it("honors caller-supplied cues", () => {
    expect(isPrimeWorthy("# Acme rebuild\nThe Acme dashboard refactor.", ["acme"])).toBe(true);
  });
});

describe("primeFromVaultPage (vault→brain priming)", () => {
  it("seeds a salience brain entry stamped with the page provenance", async () => {
    const seeded = await primeFromVaultPage({
      path: "wiki/people/jason.md",
      text: "# Jason\nI prefer vertical slices and ship ugly first.",
    });
    expect(seeded).not.toBeNull();
    expect(seeded?.region).toBe("user_model");
    expect(seeded?.sourceRef).toBe("vault:wiki/people/jason.md");
    expect(seeded?.salience).toBeGreaterThanOrEqual(0.7);
    const stored = await loadEntries();
    expect(stored.some((e) => e.sourceRef === "vault:wiki/people/jason.md")).toBe(true);
  });

  it("does not prime a generic world-knowledge page", async () => {
    const seeded = await primeFromVaultPage({
      path: "wiki/concepts/photosynthesis.md",
      text: "# Photosynthesis\nPlants convert sunlight to energy.",
    });
    expect(seeded).toBeNull();
    expect(await loadEntries()).toHaveLength(0);
  });

  it("a primed entry then collapses against its own page on the next unifiedRecall", async () => {
    await primeFromVaultPage({
      path: "wiki/projects/vanta.md",
      text: "# Vanta project\nThe goal is a local trusted operator that gates every tool call.",
    });
    const vault = memVault({
      "wiki/projects/vanta.md": "# Vanta project\nThe goal is a local trusted operator that gates every tool call.",
    });
    const r = await unifiedRecall({ query: "vanta trusted operator gates tool call", reader: vault });
    // the page surfaces, and the primed brain entry pointing at it is deduped away
    expect(r.vaultPages.map((p) => p.path)).toContain("wiki/projects/vanta.md");
    expect(r.entries.some((e) => e.sourceRef === "vault:wiki/projects/vanta.md")).toBe(false);
  });
});
