/** Renderer routing only. The preview API still validates scope, type and size. */
export function localDocumentPath(href: string, root: string): string | null {
  if (!root) return null;
  const path = decodedLocalPath(href);
  if (!path || path.startsWith("//") || path.split("/").includes("..")) return null;
  const prefix = `${root.replace(/\/+$/, "")}/`;
  if (path.startsWith("/") && !path.startsWith(prefix)) return null;
  const relative = path.startsWith("/") ? path.slice(prefix.length) : path;
  return relative.split("/").filter((part) => part && part !== ".").join("/") || null;
}

function decodedLocalPath(href: string): string | null {
  const value = href.trim().replace(/^file:\/\/\//i, "/");
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return null;
  try {
    const path = decodeURIComponent(value);
    return /[\u0000-\u001f\u007f\\?#]|%[a-f\d]{2}/i.test(path) ? null : path;
  } catch { return null; }
}
