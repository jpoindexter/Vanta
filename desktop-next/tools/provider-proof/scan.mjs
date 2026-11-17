// Every file under `root` whose bytes contain one of `secrets` (the proof's fake keys), so the proof can say
// exactly where a key was written.
import fs from "node:fs";
import path from "node:path";

export function scanForSecrets(root, secrets) {
  const hits = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.isFile() || fs.statSync(full).size > 20_000_000) continue;
      const bytes = fs.readFileSync(full);
      if (secrets.some((secret) => bytes.includes(secret))) hits.push(full);
    }
  };
  walk(root);
  return hits;
}
