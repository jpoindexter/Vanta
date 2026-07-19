import { listPackage } from "@electron/asar";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const root = process.cwd();
const asarPath = resolve(root, process.env.VANTA_DESKTOP_ASAR ?? "release/mac-arm64/Vanta.app/Contents/Resources/app.asar");
const baselinePath = resolve(root, "scripts/fixtures/desktop-x402-package-baseline.json");
const outputPath = resolve(root, process.env.VANTA_CRYPTO_FREE_PROOF ?? ".artifacts/desktop-crypto-free-proof.json");
const [manifest, lock, baseline, archiveStat] = await Promise.all([
  readJson(resolve(root, "package.json")),
  readJson(resolve(root, "package-lock.json")),
  readJson(baselinePath),
  stat(asarPath),
]);
const entries = listPackage(asarPath);
const forbidden = [
  "/node_modules/@x402/",
  "/node_modules/viem/",
  "/src/payments/x402.ts",
  "/src/payments/x402-signer.ts",
  "/src/payments/x402-wallet.ts",
];
const archiveMatches = entries.filter((entry) => forbidden.some((pattern) => entry.includes(pattern)));
const directDependencies = Object.keys(manifest.dependencies ?? {}).sort();
const lockPackages = Object.keys(lock.packages ?? {});
const dependencyMatches = [...directDependencies, ...lockPackages]
  .filter((entry) => /(^|node_modules\/)(@x402\/|viem$)/.test(entry));
const currentBytes = archiveStat.size;
const deltaBytes = currentBytes - baseline.appAsarBytes;
const proof = {
  version: 1,
  generatedAt: new Date().toISOString(),
  artifact: asarPath,
  policy: "default Vanta CLI and Desktop package contains no x402, EVM signer, or wallet runtime",
  packageInventory: {
    directDependencies,
    archiveEntries: entries.length,
  },
  sbom: {
    format: "Vanta dependency inventory v1",
    lockPackages: lockPackages.filter((entry) => entry.startsWith("node_modules/")).sort(),
  },
  sizeComparison: {
    beforeBytes: baseline.appAsarBytes,
    afterBytes: currentBytes,
    deltaBytes,
    reductionBytes: Math.max(0, -deltaBytes),
  },
  checks: {
    directCryptoDependenciesAbsent: dependencyMatches.length === 0,
    packagedCryptoRuntimeAbsent: archiveMatches.length === 0,
    defaultArtifactDidNotGrow: deltaBytes <= 0,
  },
  evidence: { dependencyMatches, archiveMatches, removedDirectPackages: baseline.directCryptoPackages },
};
if (!Object.values(proof.checks).every(Boolean)) throw new Error(`crypto-free package proof failed: ${JSON.stringify(proof.evidence)}`);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ok: true, output: outputPath, checks: proof.checks, sizeComparison: proof.sizeComparison }));

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
