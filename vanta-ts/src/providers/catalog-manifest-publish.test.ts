import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { PROVIDER_CATALOG } from "./catalog.js";

const manifestPath = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../docs/model-catalog.json");

describe("published model catalog", () => {
  it("matches the bundled provider catalog", async () => {
    const published = JSON.parse(await readFile(manifestPath, "utf8"));
    expect(published).toEqual({ version: 1, providers: PROVIDER_CATALOG });
  });
});
