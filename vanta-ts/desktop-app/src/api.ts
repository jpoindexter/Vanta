export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const boundary = desktopBoundaryToken();
  if (boundary) headers.set("x-vanta-desktop-boundary", boundary);
  const res = await fetch(path, { ...init, headers });
  let body: { error?: string } & T;
  try {
    if (typeof res.text === "function") {
      const text = await res.text();
      body = (text ? JSON.parse(text) : {}) as { error?: string } & T;
    } else body = await res.json() as { error?: string } & T;
  }
  catch { throw new Error(`Vanta returned an invalid response (${res.status}).`); }
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`);
  return body as T;
}

export function desktopBoundaryToken(): string {
  if (typeof window === "undefined") return "";
  const runtime = window as Window & { vantaDesktop?: { boundaryToken?: string } };
  const preload = runtime.vantaDesktop?.boundaryToken;
  if (preload) return preload;
  const stored = runtime.sessionStorage?.getItem("vanta.desktop.boundary");
  if (stored) return stored;
  const fragment = new URLSearchParams(runtime.location?.hash?.replace(/^#/, "") ?? "").get("boundary") ?? "";
  if (!fragment) return "";
  runtime.sessionStorage?.setItem("vanta.desktop.boundary", fragment);
  runtime.history?.replaceState(null, "", `${runtime.location.pathname}${runtime.location.search}`);
  return fragment;
}

export function desktopEventSourceUrl(path: string): string {
  const boundary = desktopBoundaryToken();
  if (!boundary) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}boundary=${encodeURIComponent(boundary)}`;
}
