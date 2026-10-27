import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Source inputs, not documentation, generated products, credentials or owner data.
const SOURCE_ROOTS = ["src", "Cargo.toml", "Cargo.lock", "build.rs", "desktop-next/apps/desktop",
  "desktop-next/apps/shared", "desktop-next/scripts", "desktop-next/tools", "desktop-next/package.json",
  "desktop-next/package-lock.json", "desktop-next/NOTICE.md", "desktop-next/LICENSE-THIRD-PARTY-MIT",
  "vanta-ts/src", "vanta-ts/scripts", "vanta-ts/package.json", "vanta-ts/package-lock.json",
  "vanta-ts/desktop-app", "LICENSE"];
const GENERATED = /(^|\/)(node_modules|dist|dist-runtime|release|target|coverage|\.git)(\/|$)/;
const SECRET = /(^|\/)(\.env(?:\..*)?|\.npmrc|\.netrc|id_rsa|id_ed25519|credentials\.json|secrets\.json)$|\.(pem|p12|pfx|key)$/i;
const digest = (value) => createHash("sha256").update(value).digest("hex");

function sourceFiles(repo) {
  const result = new Set();
  function visit(name) {
    if (GENERATED.test(name) || (name.startsWith("desktop-next/apps/desktop/build/") && !name.endsWith("/entitlements.mac.plist"))) return;
    const file = path.join(repo, name);
    if (!fs.existsSync(file)) return;
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error(`Source symlinks require a verified checkout input: ${name}`);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(file).sort()) visit(`${name}/${child}`);
    } else result.add(name);
  }
  for (const name of SOURCE_ROOTS) visit(name);
  return [...result].sort();
}

/** Fingerprint exact selected bytes, modes and internal links, without following links outside an input. */
export function fingerprintInputs(inputs) {
  const hash = createHash("sha256");
  let files = 0;
  function visit(file, relative, root) {
    if (SECRET.test(relative)) throw new Error(`Refusing secret-shaped package input: ${relative}`);
    const stat = fs.lstatSync(file);
    hash.update(JSON.stringify([relative, stat.mode & 0o777, stat.isSymbolicLink() ? "link" : stat.isDirectory() ? "dir" : "file"]));
    if (stat.isSymbolicLink()) {
      const resolved = fs.realpathSync(file);
      if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`External package input link: ${relative}`);
      hash.update(fs.readlinkSync(file));
    } else if (stat.isDirectory()) {
      for (const child of fs.readdirSync(file).sort()) visit(path.join(file, child), `${relative}/${child}`, root);
    } else if (stat.isFile()) {
      hash.update(digest(fs.readFileSync(file)));
      files++;
    } else throw new Error(`Unsupported package input: ${relative}`);
  }
  for (const [label, file] of Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b))) {
    if (SECRET.test(label)) throw new Error(`Refusing secret-shaped package input: ${label}`);
    visit(file, label, fs.realpathSync(file));
  }
  return { sha256: hash.digest("hex"), files };
}

function assertNoDotenv(repo) {
  for (const rel of ["", "desktop-next", "desktop-next/apps/desktop", "vanta-ts"]) {
    const directory = path.join(repo, rel);
    if (!fs.existsSync(directory)) continue;
    if (fs.readdirSync(directory).some((name) => /^\.env(?:\.(local|production|development|test)(?:\.local)?)?$/.test(name))) {
      throw new Error(`Unrecorded dotenv build inputs in ${rel || "repository root"}; package from a source-only checkout.`);
    }
  }
}

/** A snapshot without its own Git root has no authority to assert a source commit. */
export function captureSource(repo, { run = execFileSync } = {}) {
  const git = (...args) => run("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  let root;
  try { root = git("rev-parse", "--show-toplevel"); }
  catch { throw new Error("Package provenance requires the authoritative Git checkout; a copied snapshot is not a source identity."); }
  if (fs.realpathSync(root) !== fs.realpathSync(repo)) throw new Error("Package provenance Git root does not match the source checkout.");
  assertNoDotenv(repo);
  const fullCommit = git("rev-parse", "HEAD");
  // Walk declared source roots, including Git-ignored source files that a compiler could still import.
  const selected = sourceFiles(repo);
  const hash = createHash("sha256");
  for (const name of selected) {
    hash.update(name);
    const file = path.join(repo, name);
    if (!fs.existsSync(file)) { hash.update("deleted"); continue; }
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error(`Source symlinks require a verified checkout input: ${name}`);
    hash.update(fingerprintInputs({ [name]: file }).sha256);
  }
  return { schema: 1, scope: "declared-source-and-assembly-inputs", hermetic: false,
    fullCommit, commit: fullCommit.slice(0, 8), dirty: Boolean(git("status", "--porcelain", "--untracked-files=all")),
    source: { sha256: hash.digest("hex"), files: selected.length }, node: process.version, platform: process.platform, arch: process.arch };
}

export function assertSourceUnchanged(before, after) {
  if (before.fullCommit !== after.fullCommit || before.source.sha256 !== after.source.sha256) {
    throw new Error("Package source changed during the build; refusing to label mixed inputs. Rebuild from a stable checkout.");
  }
}

export function assemblyInputs(paths) {
  const inputs = { renderer: path.join(paths.desktop, "dist"), assets: path.join(paths.desktop, "assets"),
    runtime: paths.runtime, kernel: paths.kernel, electron: path.join(paths.electronDist, "Electron.app") };
  const publicDir = path.join(paths.desktop, "public");
  if (fs.existsSync(publicDir)) inputs.public = publicDir;
  for (const [file, name] of paths.notices) inputs[`notice/${name}`] = file;
  return inputs;
}
