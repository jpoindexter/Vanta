import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isAbsolute, normalize } from "node:path";
import { z } from "zod";
import { buildSafeChildEnv } from "../exec/child-env.js";

export const NativeBundleId = z.string().max(255).regex(/^[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*)+$/);
const Identity = z.object({ bundleId: NativeBundleId, path: z.string().max(4096) }).strict();
export type NativeAppIdentity = z.infer<typeof Identity>;
export type NativeAppAdapter = {
  resolve(bundleId: string): Promise<NativeAppIdentity | null>;
  launch(app: NativeAppIdentity): Promise<void>;
};
type Run = (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

// Static program: the model's bundle identity is data in argv, never source code.
const LOOKUP_SCRIPT = `ObjC.import("AppKit");
function run(argv) {
  var url = $.NSWorkspace.sharedWorkspace.URLForApplicationWithBundleIdentifier(argv[0]);
  if (!url || url.isNil()) return JSON.stringify({found: false});
  var bundle = $.NSBundle.bundleWithURL(url);
  if (!bundle || bundle.isNil()) return JSON.stringify({found: false});
  if (ObjC.unwrap(bundle.objectForInfoDictionaryKey("CFBundlePackageType")) !== "APPL") return JSON.stringify({found: false});
  return JSON.stringify({bundleId: ObjC.unwrap(bundle.bundleIdentifier), path: ObjC.unwrap(url.path)});
}`;

export function validateNativeAppIdentity(raw: unknown, expectedId?: string): NativeAppIdentity {
  const app = Identity.parse(raw);
  if (expectedId && app.bundleId !== expectedId) throw new Error("Application identity changed");
  if (!isAbsolute(app.path) || normalize(app.path) !== app.path || !app.path.endsWith(".app") || /[\u0000-\u001f\u007f]/.test(app.path)) {
    throw new Error("Application lookup returned an invalid bundle path");
  }
  return app;
}

const exec = promisify(execFile);
const runProcess: Run = async (file, args) => await exec(file, args, {
  encoding: "utf8", timeout: 5000, maxBuffer: 16384, env: buildSafeChildEnv(process.env),
});

/** Explicit native capability, not a shell escape: two fixed binaries, no shell or supplied arguments. */
export function createNativeAppAdapter(deps: { run?: Run } = {}): NativeAppAdapter {
  const run = deps.run ?? runProcess;
  return {
    async resolve(bundleId) {
      NativeBundleId.parse(bundleId);
      const result = await run("/usr/bin/osascript", ["-l", "JavaScript", "-e", LOOKUP_SCRIPT, bundleId]);
      const raw: unknown = JSON.parse(result.stdout);
      if (raw && typeof raw === "object" && "found" in raw && raw.found === false) return null;
      return validateNativeAppIdentity(raw, bundleId);
    },
    async launch(identity) {
      const app = validateNativeAppIdentity(identity);
      const result = await run("/usr/bin/open", ["--", app.path]);
      if (result.stderr.trim()) throw new Error("macOS did not provide an unambiguous launch acknowledgment");
    },
  };
}
