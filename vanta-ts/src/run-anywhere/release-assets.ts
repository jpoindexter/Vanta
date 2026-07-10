export type ReleaseAssetStatus = {
  ok: boolean;
  tagName?: string;
  missing: string[];
  evidence: string;
};

const REQUIRED_ANDROID_ASSETS = [
  "vanta-kernel-aarch64-linux-android",
  "vanta-kernel-aarch64-linux-android.sha256",
];

type ReleaseJson = { tag_name?: unknown; tagName?: unknown; assets?: unknown };

function assetNames(json: ReleaseJson): string[] {
  const assets = Array.isArray(json.assets) ? json.assets : [];
  return assets
    .map((asset) => typeof asset === "object" && asset !== null ? (asset as { name?: unknown }).name : undefined)
    .filter((name): name is string => typeof name === "string");
}

export function inspectAndroidReleaseAssets(json: ReleaseJson): ReleaseAssetStatus {
  const names = assetNames(json);
  const missing = REQUIRED_ANDROID_ASSETS.filter((name) => !names.includes(name));
  const tag = typeof json.tag_name === "string" ? json.tag_name : typeof json.tagName === "string" ? json.tagName : undefined;
  return {
    ok: missing.length === 0,
    tagName: tag,
    missing,
    evidence: missing.length === 0
      ? `latest release ${tag ?? "(unknown tag)"} has Android/Bionic kernel + checksum`
      : `latest release ${tag ?? "(unknown tag)"} missing ${missing.join(", ")}`,
  };
}

export async function fetchAndroidReleaseAssetStatus(opts: {
  repo?: string;
  fetch?: typeof fetch;
} = {}): Promise<ReleaseAssetStatus> {
  const repo = opts.repo ?? "jpoindexter/Vanta";
  let response: Response;
  try {
    response = await (opts.fetch ?? fetch)(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "vanta-run-anywhere-status" },
    });
  } catch (err) {
    return { ok: false, missing: [...REQUIRED_ANDROID_ASSETS], evidence: `could not reach GitHub releases: ${(err as Error).message}` };
  }
  if (!response.ok) {
    return { ok: false, missing: [...REQUIRED_ANDROID_ASSETS], evidence: `GitHub release check failed: HTTP ${response.status}` };
  }
  return inspectAndroidReleaseAssets(await response.json() as ReleaseJson);
}

export function formatReleaseAssetStatus(status: ReleaseAssetStatus): string {
  const lines = [`Android release asset check: ${status.ok ? "ready" : "not ready"}`];
  lines.push(`  evidence: ${status.evidence}`);
  if (!status.ok) lines.push("  next: publish a release containing vanta-kernel-aarch64-linux-android and its .sha256");
  return lines.join("\n");
}
