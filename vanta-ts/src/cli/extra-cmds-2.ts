// Extra CLI command handlers (set B). Extracted from extra-cmds.ts (size gate).

import { dataDirFor } from "./ops.js";
import { SafetyClient } from "../safety-client.js";

/** `vanta ref [add <url|path> | search <q> | list]` */
export async function runRefCommand(_root: string, rest: string[]): Promise<number> {
  const { addRef, searchRefs, listRefs, formatRefs, formatRefForContext } = await import("../refs/store.js");
  const sub = rest[0] ?? "list";
  if (sub === "add") {
    const source = rest[1];
    if (!source) { console.error("usage: vanta ref add <url|path>"); return 1; }
    let excerpt = "";
    if (/^https?:\/\//.test(source)) {
      try {
        const { extractReadable } = await import("../tools/web-fetch.js");
        const res = await fetch(source);
        excerpt = extractReadable(await res.text(), source).text.slice(0, 2000);
      } catch { excerpt = `(fetch failed)`; }
    } else {
      const { readFile } = await import("node:fs/promises");
      excerpt = (await readFile(source, "utf8").catch(() => "")).slice(0, 2000);
    }
    const ref = await addRef({ source, excerpt });
    console.log(`✓ ingested ${ref.id}: ${ref.title}`);
    return 0;
  }
  if (sub === "search") {
    const q = rest.slice(1).join(" ").trim();
    if (!q) { console.error("usage: vanta ref search <query>"); return 1; }
    const refs = await searchRefs(q);
    if (!refs.length) { console.log(`(no refs matched "${q}")`); return 0; }
    for (const r of refs.slice(0, 5)) console.log(`\n${formatRefForContext(r)}`);
    return 0;
  }
  console.log(formatRefs(await listRefs()));
  return 0;
}

/** `vanta settings [show | paths]` */
export async function runSettingsCommand(root: string, rest: string[]): Promise<number> {
  const { loadSettings, userSettingsPath, projectSettingsPath, localSettingsPath, formatSettings } = await import("../settings/store.js");
  const sub = rest[0] ?? "show";
  if (sub === "show") {
    const s = await loadSettings(root);
    console.log(formatSettings(s, "merged"));
    return 0;
  }
  if (sub === "paths") {
    console.log(`  user:    ${userSettingsPath()}`);
    console.log(`  project: ${projectSettingsPath(root)}`);
    console.log(`  local:   ${localSettingsPath(root)}`);
    return 0;
  }
  console.log("usage: vanta settings [show | paths]");
  return 1;
}

/** `vanta brief` / `vanta today` */
export async function runBriefCommand(root: string): Promise<void> {
  const { buildBrief } = await import("../repl/brief-cmd.js");
  const { ensureKernel } = await import("../kernel-launcher.js");
  const { join: pathJoin } = await import("node:path");
  const baseUrl = process.env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788";
  const kernelBin = pathJoin(root, "target", "debug", "vanta-kernel");
  await ensureKernel({ baseUrl, kernelBin, root }).catch(() => {});
  const safety = new SafetyClient(baseUrl);
  const out = await buildBrief({ dataDir: dataDirFor(root), env: process.env, getGoals: () => safety.getGoals() });
  console.log(out);
}
