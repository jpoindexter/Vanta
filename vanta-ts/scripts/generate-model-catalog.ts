import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PROVIDER_CATALOG } from "../src/providers/catalog.js";

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, "../../docs/model-catalog.json");

await writeFile(output, `${JSON.stringify({ version: 1, providers: PROVIDER_CATALOG }, null, 2)}\n`, "utf8");
console.log(`generated ${output}`);
