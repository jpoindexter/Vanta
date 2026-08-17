import { createHash } from "node:crypto";

export const AUTONOMY_DEFINITIONS = [
  "R0 — Observe: read, classify, and report; no mutation.",
  "R1 — Recommend: identify the outcome and propose one next action; no mutation.",
  "R2 — Prepare: create private, reversible drafts, tasks, notes, reminders, or isolated artifacts.",
  "R3 — Confirm: show the exact action preview and require fresh one-use authority.",
  "R4 — Delegate: run an allowlisted recurring workflow within explicit target, account, recipient, quota, budget, expiry, exclusions, cancellation, and review bounds.",
  "R5 — Autonomous delegate: in a proven bounded domain, initiate, chain, coordinate, communicate with permitted parties, monitor, reconcile, follow up, and recover without per-step approval.",
];

export const EXPECTED_ITEM_HASHES = {
  "TRUST-02": "139eaa6c46f014cb4a9c77bad434a9d654818815009f6617eb5ea5cb48c663f8",
  "UX-03": "6d845c5dd4d5b461303aa7140cc548fe323afd06430f1090e7a1a9ba6a7e8e91",
  "TRUST-04": "07b81a707b9006b8171cca11f9761785fe4c4aefdb3a784b6f18bd7f43e90b0c",
  "TRUST-01": "d3f19ec82a0c8aabaa24e0082525a9b1872ffa105d8dadaeb57aa1ddb5b18616",
  "OP-01": "4054afa9779c54d057908cb383cf417fe4e93c39d18f5c42f544bf4d3c7a3e74",
  "GROW-01": "cfdc2b494b7fc6eb9dc352b494d829e8fb08a8664f28f6b9733e96785885bc66",
  "TRUST-03": "607578a734a0477ea237d94ad0b12b1fb76a1b86bc695ef3ecacde8314f5b284",
  "TRUST-05": "b5dea29d6bf3979251fac4760c4e690f3aef2f39f96bf54b049fec3788f4a9cf",
  "TRUST-06": "95e78b45cf75f4962d59bae0ef595700ad451dceb5fc3e6b9e9f8e48053d2ec0",
  "OP-03": "718ca3816e07bcfa46c2adffba8ae4506f1a6438c28c7b18ab73f1572e693ffd",
  "UX-04": "e077de40bceaded44b12bcd20171bb11c2cb5a83d76131341fc5e7d62da27fc2",
  "LIFE-02": "5d3235f70bf2105209a35f76d0189bc834020aec759182bc6f044e452e7b73dd",
  "VANTA-STREAMING-TTS-GATEWAY-AUDIO": "88d04d1b228b40a1cf13a414edac87693c885a4dc8255cfc6e27eb54c14879a5",
  "VANTA-MSA-NATIVE-RUNTIME-PORT": "ad0e8ad178ff05da6c34854e1fb5c05674dbaf6f8ef3e430cbc4b658f9320424",
  "BROWSER-WORKFLOW-ACTION-BOUNDARY": "c81de34fec9cc290ac29f6f5fcad175e3005a5cc763c8fcf59201b17035d7174",
  "QUICKSILVER-STARTUP-CRITICAL-PATH": "68d5d6cb0d4149cb553ebd82f798f78cec22a4ab2e8a557ef742fcadcf9ce131",
  "QUICKSILVER-DESKTOP-STREAM-PERF": "88b915e4ef128ef1ebfcace08332893167e32ee6905573075134eea4d9c805c4",
  "GATEWAY-DELIVERY-OBLIGATION-LEDGER": "153710c25b0be9007af8c17fb1ca381bb1b69aec4ca27cdc2e48bf2e60d5b266",
  "EF-SUPPORT-DESKTOP-CONTROLS": "bb1c9592843b3730624d51ecefaeaa180185bb9fe33cfaa92cea4a1c84c31b44",
  "EF-SUPPORT-STATE-EXPIRY": "8ba2604c7171756b1ebb3e471f43ef18b4c358d70347cdddff9399d13b20d254",
  "EF-SUPPORT-NONOVERREACH-EVALS": "b01198f1d077fdeef79bc4aa6ab81eb3ac1148fc1ad24e9f89ce4eee53ed85eb",
  "REWARD-SEEKING-THREAT-MODEL": "04001d5de4b7e086326e48dd0e5e0c9ecd6ddd82b8afbaf74d286299497b8f26",
  "REWARD-PROCESS-INTEGRITY-BOUNDARY": "f9786cdcaadaaf40b804ef2a79e8069647c8e4848846698cef0b909b0c55661e",
  "REWARD-SEEKING-CONTRASTIVE-DETECTOR": "f92c5ccbae54a12aaa2ce038dc2beb85bf7790a64579c195d2949e6f9594963d",
  "REWARD-SEEKING-BEHAVIORAL-SIGNAL-SUITE": "92cc0102ddf37b892abd279be20fe8eb1f04486b7f5b40fe50be6f3acf63fe7f",
  "REWARD-SEEKING-CALIBRATION-CONTROLS": "b9f8fcaea3b0c24b4f3544ff6f961ace391f07a563a943c71f94776fc767ebbf",
  "REWARD-SEEKING-EVAL-AWARENESS-REDTEAM": "065fa5917a225250f013f491e2909f5cb1e8081ccc5bdb2d40aeb4e402b826be",
  "REWARD-SEEKING-OVERSIGHT-GENERALIZATION": "2791d8dce9eb7745c0ccfef062c2f2a51bf2ccae5b9f974e4020e1d4f77f472d",
  "REWARD-SEEKING-MODEL-LEDGER": "36c6c88ee42665686d2dde609a707bd26d3cbf74d0279521e8e599ecb6170249",
  "REWARD-SEEKING-RELEASE-GATE": "18008c81a1495dc17d1f50aff7de759b104d0f2aaa16518becd65ff317941b5f",
  "CONNECT-INTEGRATION-STATE-CATALOG": "e4af1b7827262d7df8bf117bc3b2771ccfb198a0c4b371eda26b32d1d0cbd662",
  "CONNECT-TRELLO-ADAPTER": "d802c852f3b5c3443746397b5e9d380f35d9e1bce6f086183ee18902db77ff1e",
  "CONNECT-DROPBOX-ADAPTER": "bc5570711361eb752cd9d787ccdbf10fbe9180aecb460dca1dd7fddf961de2f6",
  "CONNECT-BOX-DRIVE-ROVO-PACKS": "6a2a1b476d5526896082209dfa391bd8ecb0158ecb478064383c2c6fd4a95783",
};

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function validateCanonicalRoadmap(roadmap, RoadmapSchema) {
  const parsed = RoadmapSchema.safeParse(roadmap);
  if (!parsed.success) {
    throw new Error(`canonical roadmap schema failed: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  }
  const ids = new Set();
  for (const item of roadmap.items) {
    if (ids.has(item.id)) throw new Error(`duplicate roadmap ID: ${item.id}`);
    ids.add(item.id);
  }
  for (const item of roadmap.items) {
    for (const dependency of item.after ?? []) {
      if (dependency === item.id) throw new Error(`${item.id}: self-dependency`);
      if (!ids.has(dependency)) throw new Error(`${item.id}: missing dependency ${dependency}`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const byId = new Map(roadmap.items.map((item) => [item.id, item]));
  function visit(id, trail = []) {
    if (visiting.has(id)) throw new Error(`roadmap dependency cycle: ${[...trail, id].join(" -> ")}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.after ?? []) visit(dependency, [...trail, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of ids) visit(id);
  return roadmap;
}

export function validatePinnedItems(roadmap) {
  const byId = new Map(roadmap.items.map((item) => [item.id, item]));
  for (const [id, expected] of Object.entries(EXPECTED_ITEM_HASHES)) {
    const item = byId.get(id);
    if (!item) throw new Error(`pinned roadmap item missing: ${id}`);
    const actual = sha256(JSON.stringify(item));
    if (actual !== expected) throw new Error(`${id}: exact pinned record differs (${actual})`);
  }
}

function normalizeContractText(text) {
  return text.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
}

export function validateAutonomyContractText(text, label) {
  const normalized = normalizeContractText(text);
  for (const definition of AUTONOMY_DEFINITIONS) {
    if (!normalized.includes(definition)) throw new Error(`${label}: exact autonomy definition missing: ${definition}`);
  }
}

export function forbiddenSourcePaths(paths) {
  return paths.filter((path) =>
    path === "MANIFESTO.md"
    || path.startsWith("src/")
    || path.startsWith("vanta-ts/src/")
    || path.startsWith("vanta-ts/desktop-app/src/")
    || path.startsWith("scripts/")
    || path.startsWith("vanta-ts/scripts/")
    || /(?:^|\/)(?:package(?:-lock)?\.json|Cargo\.(?:toml|lock)|tsconfig[^/]*\.json|vite\.config\.[^/]+)$/.test(path)
  );
}

export function validateSourceGuard(paths) {
  const forbidden = forbiddenSourcePaths(paths);
  if (forbidden.length) throw new Error(`correction-only source guard failed: ${forbidden.join(", ")}`);
  return forbidden;
}
